import { query, getPool } from "../config/db.js";
import { calculateLeague } from "../utils/leagueHelper.js";
import { verifyMediaBatch } from "../services/imageVerificationService.js";

// Helper to ensure a user exists in the database
async function ensureUserExists(userData) {
  if (!userData) return "user_anon";
  const userId = userData.id || userData.user_id || `user_${Date.now()}`;
  const username = userData.username || userData.name?.toLowerCase().replace(/\s+/g, "_") || "traveler";
  const email = userData.email || `${username}@laga.tour`;
  const nameParts = (userData.name || username).split(" ");
  const firstName = nameParts[0] || "Traveler";
  const lastName = nameParts.slice(1).join(" ") || "";
  const avatar = userData.avatar || userData.profile_picture_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`;
  const points = userData.points || userData.league_points || 350;

  try {
    await query(`
      INSERT INTO users (user_id, email, username, first_name, last_name, profile_picture_url, league_points)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        username = VALUES(username),
        profile_picture_url = VALUES(profile_picture_url),
        league_points = VALUES(league_points)
    `, [userId, email, username, firstName, lastName, avatar, points]);
  } catch (err) {
    console.error("Error ensuring user exists:", err.message);
  }

  return userId;
}

/**
 * Shared Post Aggregator Helper:
 * Hydrates raw SQL post rows with media (photos/videos), comments, user likes/saves, and author profile details.
 */
async function formatPostsWithMediaAndComments(postsRaw, currentUserId = null, forceSaved = false) {
  if (!postsRaw || postsRaw.length === 0) return [];

  const postIds = postsRaw.map(p => p.id);
  const placeholders = postIds.map(() => "?").join(",");

  // 1. Fetch media
  const mediaRaw = await query(
    `SELECT media_id, post_id, media_url, media_type, ai_verification_status 
     FROM post_media 
     WHERE post_id IN (${placeholders})
     ORDER BY created_at ASC`,
    postIds
  );

  // 2. Fetch comments
  const commentsRaw = await query(
    `SELECT 
      c.comment_id AS id,
      c.post_id,
      c.user_id,
      c.comment_text AS text,
      c.created_at,
      u.username,
      u.first_name,
      u.last_name,
      u.profile_picture_url AS avatar
     FROM post_comments c
     LEFT JOIN users u ON c.user_id = u.user_id
     WHERE c.post_id IN (${placeholders})
     ORDER BY c.created_at ASC`,
    postIds
  );

  // 3. User interaction state
  let likedPostIds = new Set();
  let savedPostIds = new Set();

  if (currentUserId) {
    const likesRaw = await query(
      `SELECT post_id FROM post_likes WHERE user_id = ? AND post_id IN (${placeholders})`,
      [currentUserId, ...postIds]
    );
    likesRaw.forEach(r => likedPostIds.add(r.post_id));

    const savesRaw = await query(
      `SELECT post_id FROM saved_posts WHERE user_id = ? AND post_id IN (${placeholders})`,
      [currentUserId, ...postIds]
    );
    savesRaw.forEach(r => savedPostIds.add(r.post_id));
  }

  // 4. Format objects
  return postsRaw.map(post => {
    const mediaList = mediaRaw.filter(m => m.post_id === post.id);
    const images = mediaList.filter(m => m.media_type === "photo").map(m => m.media_url);
    const videos = mediaList.filter(m => m.media_type === "video").map(m => m.media_url);
    const postComments = commentsRaw.filter(c => c.post_id === post.id).map(c => ({
      id: c.id,
      user: c.username || `${c.first_name || 'Traveler'}`,
      avatar: c.avatar,
      text: c.text,
      time: new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
    }));

    const fullName = [post.first_name, post.last_name].filter(Boolean).join(" ") || post.username || "Traveler";
    const league = calculateLeague(post.league_points);

    return {
      id: post.id,
      author: {
        id: post.author_id,
        name: fullName,
        username: post.username || "traveler",
        avatar: post.profile_picture_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${post.username}`,
        league: league
      },
      caption: post.caption || "",
      images: images,
      videos: videos,
      image: images[0] || (images.length === 0 && videos.length === 0 ? "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800" : ""),
      video: videos[0] || "",
      likes: post.likes || 0,
      shares: post.shares || 0,
      saves: post.saves || 0,
      comments: postComments,
      hasLiked: likedPostIds.has(post.id),
      hasSaved: forceSaved || savedPostIds.has(post.id),
      isPublic: Boolean(post.is_public),
      isHidden: post.is_public === 0,
      time: new Date(post.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
      createdAt: post.created_at,
      savedAt: post.saved_at || null
    };
  });
}

/**
 * GET /api/posts
 * Fetch all posts with media, comments, like/save states for current user
 */
export async function getAllPosts(req, res) {
  try {
    const currentUserId = req.query.userId || null;
    const includeHidden = req.query.includeHidden === "true";

    const visibilityCondition = includeHidden ? "" : "WHERE p.is_public = 1";
    const sql = `
      SELECT 
        p.post_id AS id,
        p.user_id AS author_id,
        p.caption,
        p.likes_count AS likes,
        p.comments_count,
        p.shares_count AS shares,
        p.saves_count AS saves,
        p.is_public,
        p.created_at,
        p.updated_at,
        u.username,
        u.first_name,
        u.last_name,
        u.profile_picture_url,
        u.league_points
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.user_id
      ${visibilityCondition}
      ORDER BY p.created_at DESC
    `;

    const postsRaw = await query(sql);
    const formattedPosts = await formatPostsWithMediaAndComments(postsRaw, currentUserId);
    res.json({ success: true, posts: formattedPosts });
  } catch (error) {
    console.error("Error in getAllPosts:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/posts/verify-media
 * Validate uploaded media items against tourism criteria & community safety standards
 */
export async function verifyPostMedia(req, res) {
  try {
    const { media = [], destination = "" } = req.body;
    if (!Array.isArray(media) || media.length === 0) {
      return res.status(400).json({ success: false, message: "Media array is required for verification." });
    }

    const verificationResults = await verifyMediaBatch(media, destination);
    const hasFailures = verificationResults.some(r => !r.isApproved);

    res.json({
      success: true,
      isAllApproved: !hasFailures,
      results: verificationResults
    });
  } catch (error) {
    console.error("Error in verifyPostMedia:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/posts
 * Create a new travel post with photos and videos
 */
export async function createPost(req, res) {
  try {
    const { author, caption, images = [], videos = [], destination = "General Exploration", isPublic = true } = req.body;

    if (!caption && images.length === 0 && videos.length === 0) {
      return res.status(400).json({ success: false, message: "Caption or media is required to create a post." });
    }

    // Server-Side Strict Verification Check on Photos
    if (images.length > 0) {
      const mediaList = images.map(img => (typeof img === "object" ? img : { url: img }));
      const mediaVerification = await verifyMediaBatch(mediaList, destination);
      const rejected = mediaVerification.filter(v => !v.isApproved);
      if (rejected.length > 0) {
        return res.status(422).json({
          success: false,
          message: `Upload rejected: ${rejected[0].reason}`,
          rejectedDetails: rejected
        });
      }
    }

    const userId = await ensureUserExists(author);
    const postId = "post_" + Date.now();

    // Insert Post into MySQL
    await query(
      `INSERT INTO posts (post_id, user_id, caption, likes_count, comments_count, shares_count, saves_count, is_public)
       VALUES (?, ?, ?, 0, 0, 0, 0, ?)`,
      [postId, userId, caption || "", isPublic ? 1 : 0]
    );

    // Insert Photos
    for (let i = 0; i < images.length; i++) {
      const mediaId = `media_img_${Date.now()}_${i}`;
      await query(
        `INSERT INTO post_media (media_id, post_id, media_url, media_type, ai_verification_status)
         VALUES (?, ?, ?, 'photo', 'approved')`,
        [mediaId, postId, images[i]]
      );
    }

    // Insert Videos
    for (let i = 0; i < videos.length; i++) {
      const mediaId = `media_vid_${Date.now()}_${i}`;
      await query(
        `INSERT INTO post_media (media_id, post_id, media_url, media_type, ai_verification_status)
         VALUES (?, ?, ?, 'video', 'approved')`,
        [mediaId, postId, videos[i]]
      );
    }

    // Award user points for publishing a post
    await query(`UPDATE users SET league_points = league_points + 50, total_trips_shared = total_trips_shared + 1 WHERE user_id = ?`, [userId]);

    const createdPost = {
      id: postId,
      author: {
        id: userId,
        name: author?.name || author?.username || "Traveler",
        username: author?.username || "traveler",
        avatar: author?.avatar || author?.profile_picture_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${author?.username}`,
        league: calculateLeague(author?.points || 350)
      },
      caption: caption,
      destination: destination,
      images: images,
      videos: videos,
      image: images[0] || "",
      video: videos[0] || "",
      likes: 0,
      shares: 0,
      saves: 0,
      comments: [],
      hasLiked: false,
      hasSaved: false,
      isHidden: !isPublic,
      time: "Just now",
      createdAt: new Date().toISOString()
    };

    res.status(201).json({ success: true, post: createdPost });
  } catch (error) {
    console.error("Error in createPost:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/posts/:id/like
 * Toggle like for current user on a post
 */
export async function toggleLike(req, res) {
  try {
    const postId = req.params.id;
    const { user } = req.body;
    const userId = await ensureUserExists(user);

    // Check if like exists
    const existingLikes = await query(
      `SELECT like_id FROM post_likes WHERE post_id = ? AND user_id = ?`,
      [postId, userId]
    );

    let hasLiked = false;

    if (existingLikes.length > 0) {
      // Remove Like
      await query(`DELETE FROM post_likes WHERE post_id = ? AND user_id = ?`, [postId, userId]);
      await query(`UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE post_id = ?`, [postId]);
      hasLiked = false;
    } else {
      // Add Like
      const likeId = `like_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      await query(
        `INSERT INTO post_likes (like_id, post_id, user_id, liked_type) VALUES (?, ?, ?, 'post')`,
        [likeId, postId, userId]
      );
      await query(`UPDATE posts SET likes_count = likes_count + 1 WHERE post_id = ?`, [postId]);
      // Give points to user for engagement
      await query(`UPDATE users SET league_points = league_points + 5 WHERE user_id = ?`, [userId]);
      hasLiked = true;
    }

    // Get updated likes count
    const [post] = await query(`SELECT likes_count FROM posts WHERE post_id = ?`, [postId]);
    const likesCount = post ? post.likes_count : 0;

    res.json({ success: true, hasLiked, likes: likesCount });
  } catch (error) {
    console.error("Error in toggleLike:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/posts/:id/comment
 * Add comment to a post
 */
export async function addComment(req, res) {
  try {
    const postId = req.params.id;
    const { user, text, parentCommentId = null } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: "Comment text cannot be empty." });
    }

    const userId = await ensureUserExists(user);
    const commentId = `c_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    await query(
      `INSERT INTO post_comments (comment_id, post_id, user_id, comment_text, parent_comment_id, commented_type)
       VALUES (?, ?, ?, ?, ?, 'post')`,
      [commentId, postId, userId, text.trim(), parentCommentId]
    );

    // Increment post comments count
    await query(`UPDATE posts SET comments_count = comments_count + 1 WHERE post_id = ?`, [postId]);
    // Give user points for comment
    await query(`UPDATE users SET league_points = league_points + 10 WHERE user_id = ?`, [userId]);

    const newComment = {
      id: commentId,
      postId: postId,
      user: user?.username || user?.name || "traveler",
      avatar: user?.avatar || user?.profile_picture_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user?.username || 'traveler'}`,
      text: text.trim(),
      time: "Just now"
    };

    res.status(201).json({ success: true, comment: newComment });
  } catch (error) {
    console.error("Error in addComment:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/posts/:id/save
 * Toggle save/bookmark for current user on a post
 */
export async function toggleSave(req, res) {
  try {
    const postId = req.params.id;
    const { user } = req.body;
    const userId = await ensureUserExists(user);

    const existingSaves = await query(
      `SELECT saved_id FROM saved_posts WHERE post_id = ? AND user_id = ?`,
      [postId, userId]
    );

    let hasSaved = false;

    if (existingSaves.length > 0) {
      // Remove Save
      await query(`DELETE FROM saved_posts WHERE post_id = ? AND user_id = ?`, [postId, userId]);
      await query(`UPDATE posts SET saves_count = GREATEST(0, saves_count - 1) WHERE post_id = ?`, [postId]);
      hasSaved = false;
    } else {
      // Add Save
      const savedId = `saved_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      await query(
        `INSERT INTO saved_posts (saved_id, user_id, post_id, saved_type) VALUES (?, ?, ?, 'post')`,
        [savedId, userId, postId]
      );
      await query(`UPDATE posts SET saves_count = saves_count + 1 WHERE post_id = ?`, [postId]);
      hasSaved = true;
    }

    const [post] = await query(`SELECT saves_count FROM posts WHERE post_id = ?`, [postId]);
    const savesCount = post ? post.saves_count : 0;

    res.json({ success: true, hasSaved, saves: savesCount });
  } catch (error) {
    console.error("Error in toggleSave:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/posts/:id/share
 * Increment shares count for a post & return share payload
 */
export async function sharePost(req, res) {
  try {
    const postId = req.params.id;

    await query(`UPDATE posts SET shares_count = shares_count + 1 WHERE post_id = ?`, [postId]);

    const [post] = await query(`SELECT shares_count FROM posts WHERE post_id = ?`, [postId]);
    const sharesCount = post ? post.shares_count : 0;

    res.json({
      success: true,
      shares: sharesCount,
      shareUrl: `${req.protocol}://${req.get("host")}/post/${postId}`,
      message: "Post shared successfully!"
    });
  } catch (error) {
    console.error("Error in sharePost:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/posts/:id/report
 * Submit a report for post moderation
 */
export async function reportPost(req, res) {
  try {
    const postId = req.params.id;
    const { user, reason, reporterName } = req.body;
    const userId = await ensureUserExists(user);

    const reportId = `rep_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const reportDesc = reason?.trim() || "Inappropriate or misleading content";

    await query(
      `INSERT INTO reports (report_id, post_id, user_id, report_description) VALUES (?, ?, ?, ?)`,
      [reportId, postId, userId, reportDesc]
    );

    res.status(201).json({
      success: true,
      reportId: reportId,
      message: "Report submitted to admin moderation successfully."
    });
  } catch (error) {
    console.error("Error in reportPost:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/reports
 * Fetch all reports for admin moderation
 */
export async function getReports(req, res) {
  try {
    const sql = `
      SELECT 
        r.report_id AS id,
        r.post_id AS postId,
        r.report_description AS reason,
        r.created_at,
        u_rep.username AS reporter_username,
        u_rep.first_name AS reporter_first_name,
        u_rep.last_name AS reporter_last_name,
        p.caption AS post_caption,
        p.is_public AS post_is_public,
        u_author.username AS author_username,
        u_author.first_name AS author_first_name,
        u_author.last_name AS author_last_name,
        u_author.profile_picture_url AS author_avatar
      FROM reports r
      LEFT JOIN posts p ON r.post_id = p.post_id
      LEFT JOIN users u_rep ON r.user_id = u_rep.user_id
      LEFT JOIN users u_author ON p.user_id = u_author.user_id
      ORDER BY r.created_at DESC
    `;

    const reportsRaw = await query(sql);

    // Fetch media for reported posts
    const postIds = [...new Set(reportsRaw.map(r => r.postId).filter(Boolean))];
    let mediaMap = {};

    if (postIds.length > 0) {
      const placeholders = postIds.map(() => "?").join(",");
      const mediaRaw = await query(
        `SELECT post_id, media_url, media_type FROM post_media WHERE post_id IN (${placeholders})`,
        postIds
      );
      mediaRaw.forEach(m => {
        if (!mediaMap[m.post_id]) mediaMap[m.post_id] = [];
        mediaMap[m.post_id].push(m);
      });
    }

    const reports = reportsRaw.map(r => {
      const pMedia = mediaMap[r.postId] || [];
      const img = pMedia.find(m => m.media_type === "photo")?.media_url || "";
      const vid = pMedia.find(m => m.media_type === "video")?.media_url || "";

      return {
        id: r.id,
        postId: r.postId,
        reason: r.reason,
        reporter: r.reporter_username || [r.reporter_first_name, r.reporter_last_name].filter(Boolean).join(" ") || "Anonymous Traveler",
        timestamp: new Date(r.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
        status: "pending",
        post: {
          id: r.postId,
          caption: r.post_caption,
          image: img,
          video: vid,
          isHidden: r.post_is_public === 0,
          author: {
            name: [r.author_first_name, r.author_last_name].filter(Boolean).join(" ") || r.author_username || "Traveler",
            username: r.author_username || "traveler",
            avatar: r.author_avatar
          }
        }
      };
    });

    res.json({ success: true, reports });
  } catch (error) {
    console.error("Error in getReports:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/posts/user/:userId
 * Fetch all posts by a specific user (including private ones)
 */
export async function getUserPosts(req, res) {
  try {
    const { userId } = req.params;
    const currentUserId = req.query.currentUserId || userId;

    const sql = `
      SELECT 
        p.post_id AS id,
        p.user_id AS author_id,
        p.caption,
        p.likes_count AS likes,
        p.comments_count,
        p.shares_count AS shares,
        p.saves_count AS saves,
        p.is_public,
        p.created_at,
        p.updated_at,
        u.username,
        u.first_name,
        u.last_name,
        u.profile_picture_url,
        u.league_points
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.user_id
      WHERE p.user_id = ? OR LOWER(u.username) = ?
      ORDER BY p.created_at DESC
    `;

    const postsRaw = await query(sql, [userId, userId.toLowerCase()]);
    const formattedPosts = await formatPostsWithMediaAndComments(postsRaw, currentUserId);
    res.json({ success: true, posts: formattedPosts });
  } catch (error) {
    console.error("Error in getUserPosts:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/posts/saved/:userId
 * Fetch all posts saved/bookmarked by a user
 */
export async function getSavedPosts(req, res) {
  try {
    const { userId } = req.params;

    const sql = `
      SELECT 
        p.post_id AS id,
        p.user_id AS author_id,
        p.caption,
        p.likes_count AS likes,
        p.comments_count,
        p.shares_count AS shares,
        p.saves_count AS saves,
        p.is_public,
        p.created_at,
        p.updated_at,
        u.username,
        u.first_name,
        u.last_name,
        u.profile_picture_url,
        u.league_points,
        sp.saved_at
      FROM saved_posts sp
      INNER JOIN posts p ON sp.post_id = p.post_id
      LEFT JOIN users u ON p.user_id = u.user_id
      WHERE sp.user_id = ?
      ORDER BY sp.saved_at DESC
    `;

    const postsRaw = await query(sql, [userId]);
    const formattedPosts = await formatPostsWithMediaAndComments(postsRaw, userId, true);
    res.json({ success: true, posts: formattedPosts });
  } catch (error) {
    console.error("Error in getSavedPosts:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * PUT /api/posts/:id
 * Update a post's caption, images, and visibility (public/private)
 */
export async function updatePost(req, res) {
  try {
    const postId = req.params.id;
    const { caption, images, videos, isPublic } = req.body;

    const updates = [];
    const values = [];

    if (caption !== undefined) {
      updates.push("caption = ?");
      values.push(caption);
    }
    if (isPublic !== undefined) {
      updates.push("is_public = ?");
      values.push(isPublic ? 1 : 0);
    }

    if (updates.length > 0) {
      values.push(postId);
      await query(`UPDATE posts SET ${updates.join(", ")} WHERE post_id = ?`, values);
    }

    // If new images provided, replace post_media photos
    if (Array.isArray(images)) {
      await query("DELETE FROM post_media WHERE post_id = ? AND media_type = 'photo'", [postId]);
      for (let i = 0; i < images.length; i++) {
        const mediaId = `media_img_${Date.now()}_${i}`;
        await query(
          `INSERT INTO post_media (media_id, post_id, media_url, media_type, ai_verification_status)
           VALUES (?, ?, ?, 'photo', 'approved')`,
          [mediaId, postId, images[i]]
        );
      }
    }

    // If new videos provided, replace post_media videos
    if (Array.isArray(videos)) {
      await query("DELETE FROM post_media WHERE post_id = ? AND media_type = 'video'", [postId]);
      for (let i = 0; i < videos.length; i++) {
        const mediaId = `media_vid_${Date.now()}_${i}`;
        await query(
          `INSERT INTO post_media (media_id, post_id, media_url, media_type, ai_verification_status)
           VALUES (?, ?, ?, 'video', 'approved')`,
          [mediaId, postId, videos[i]]
        );
      }
    }

    res.json({
      success: true,
      message: "Post updated successfully in database!",
      postId
    });
  } catch (error) {
    console.error("Error in updatePost:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * DELETE /api/posts/:id
 * Permanently delete a post from the database
 */
export async function deletePost(req, res) {
  try {
    const postId = req.params.id;

    // Delete post (foreign keys with ON DELETE CASCADE will clean up post_media, comments, likes, saves, reports)
    await query("DELETE FROM posts WHERE post_id = ?", [postId]);

    res.json({
      success: true,
      message: "Post deleted permanently from database.",
      postId
    });
  } catch (error) {
    console.error("Error in deletePost:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * PATCH /api/posts/:id/visibility
 * Toggle post visibility (public/private) or Admin action: Hide / Unhide
 */
export async function updatePostVisibility(req, res) {
  try {
    const postId = req.params.id;
    const { isPublic } = req.body;

    const isPublicVal = isPublic ? 1 : 0;
    await query(`UPDATE posts SET is_public = ? WHERE post_id = ?`, [isPublicVal, postId]);

    res.json({ success: true, postId, isPublic: Boolean(isPublicVal) });
  } catch (error) {
    console.error("Error in updatePostVisibility:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * DELETE /api/reports/:id
 * Admin action: Dismiss report
 */
export async function dismissReport(req, res) {
  try {
    const reportId = req.params.id;
    await query(
      `UPDATE reports SET status = 'dismissed', action_taken = 'Dismissed by administrator' WHERE report_id = ?`,
      [reportId]
    );
    res.json({ success: true, message: "Report dismissed and archived successfully." });
  } catch (error) {
    console.error("Error in dismissReport:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
