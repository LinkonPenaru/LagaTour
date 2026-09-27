import { query, getPool } from "../config/db.js";
import { calculateLeague } from "../utils/leagueHelper.js";
import { getIO } from "../services/socketService.js";

/**
 * Helper to ensure author user exists in DB
 */
async function ensureUserExists(userData) {
  if (!userData) return "user_1";
  const userId = userData.id || userData.user_id || `user_1`;
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
 * Format a single stop database row
 */
export function formatStopRow(s, idx = 0) {
  let parsedPhotos = [];
  if (s.photos) {
    try {
      parsedPhotos = typeof s.photos === "string" ? JSON.parse(s.photos) : s.photos;
      if (!Array.isArray(parsedPhotos)) parsedPhotos = [parsedPhotos];
    } catch (e) {
      parsedPhotos = s.photos.split(",").map(p => p.trim()).filter(Boolean);
    }
  }

  return {
    id: s.tour_plan_place_id,
    order: (idx !== null && idx !== undefined) ? (idx + 1) : (s.stop_order || 1),
    placeId: s.place_id || null,
    placeName: s.place_name || s.location || "Scenic Spot",
    location: s.location || s.place_name || "",
    lat: Number(s.latitude || 23.8103),
    lng: Number(s.longitude || 90.4125),
    transportMode: s.transport_mode || "Bus",
    transportDetails: s.transport_details || "",
    transportCost: Number(s.transport_cost || 0),
    hasAccommodation: Boolean(s.has_accommodation),
    accommodationType: s.accommodation_type || "Hotel",
    accommodationName: s.accommodation_name || "",
    accommodationCost: Number(s.accommodation_cost || 0),
    accommodationDetails: s.accommodation_details || "",
    stayDuration: s.stay_duration || "1 Night",
    notes: s.notes || "",
    status: s.status || "pending", // 'pending' | 'checked_in' | 'skipped' | 'planned'
    isSpontaneous: Boolean(s.is_spontaneous),
    discoveryBadge: s.discovery_badge || "",
    checkInTime: s.check_in_time || null,
    checkInGps: s.check_in_lat ? { lat: Number(s.check_in_lat), lng: Number(s.check_in_lng) } : null,
    checkInNote: s.check_in_note || "",
    photos: parsedPhotos,
    expense: Number(s.Expense || s.expense || 0)
  };
}

/**
 * Sort stops dynamically: checked-in stops appear first ordered chronologically by check_in_time ASC,
 * followed by pending/planned stops ordered by their scheduled stop_order ASC.
 */
export function sortAndFormatStops(stopsRaw = []) {
  return [...stopsRaw]
    .sort((a, b) => {
      const aChecked = a.status === 'checked_in' && a.check_in_time;
      const bChecked = b.status === 'checked_in' && b.check_in_time;
      if (aChecked && bChecked) {
        return new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime();
      }
      if (aChecked && !bChecked) return -1;
      if (!aChecked && bChecked) return 1;
      return (a.stop_order || 0) - (b.stop_order || 0);
    })
    .map((s, idx) => formatStopRow(s, idx));
}

/**
 * Automatically update database stop_order based on actual check-in sequence
 */
export async function resequenceTourStops(tourPlanId) {
  const stops = await query(`
    SELECT tour_plan_place_id, status, check_in_time, stop_order
    FROM tour_plan_places_modified
    WHERE tour_plan_id = ?
    ORDER BY 
      CASE WHEN status = 'checked_in' AND check_in_time IS NOT NULL THEN 0 ELSE 1 END ASC,
      check_in_time ASC,
      stop_order ASC
  `, [tourPlanId]);

  for (let i = 0; i < stops.length; i++) {
    const newOrder = i + 1;
    if (stops[i].stop_order !== newOrder) {
      await query(
        "UPDATE tour_plan_places_modified SET stop_order = ? WHERE tour_plan_place_id = ?",
        [newOrder, stops[i].tour_plan_place_id]
      );
    }
  }
}

/**
 * Shared Tour Plan Formatter
 * Transforms raw SQL rows into the rich frontend Expedition / Tour Plan model
 */
function formatTourPlan(plan, stops = [], companions = [], expenses = [], currentUserId = null, userLikes = new Set(), userSaves = new Set()) {
  const authorName = [plan.first_name, plan.last_name].filter(Boolean).join(" ") || plan.author_name || plan.username || "Traveler";
  const authorAvatar = plan.profile_picture_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${plan.username || 'traveler'}`;
  const authorPoints = Number(plan.league_points || 350);

  // Format stops dynamically sequenced by check-in sequence
  const planStops = stops.filter(s => s.tour_plan_id === plan.tour_plan_id);
  const formattedStops = sortAndFormatStops(planStops);

  // Format companions
  const formattedCompanions = companions
    .filter(c => c.tour_plan_id === plan.tour_plan_id)
    .map(c => ({
      id: c.id,
      userId: c.user_id || null,
      name: c.name,
      username: c.username || c.name.toLowerCase().replace(/\s+/g, "_"),
      avatar: c.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${c.name}`,
      phone: c.phone || "",
      role: c.role || "Member",
      inviteStatus: c.invite_status || "accepted"
    }));

  // Format expenses
  const formattedExpenses = expenses
    .filter(e => e.tour_plan_id === plan.tour_plan_id)
    .map(e => ({
      id: e.expense_id,
      stopId: e.stop_id || null,
      category: e.category || "General",
      amount: Number(e.amount || 0),
      note: e.note || "",
      timestamp: e.timestamp || new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));

  // Calculate spent budget
  const totalExpensesSum = formattedExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const spentBudget = Number(plan.spent_budget || 0) || totalExpensesSum;

  // Determine current GPS
  const checkedStops = formattedStops.filter(s => s.status === "checked_in" && s.checkInGps);
  const latestChecked = checkedStops[checkedStops.length - 1];
  const currentGps = latestChecked?.checkInGps 
    ? { ...latestChecked.checkInGps, lastUpdated: "Live Check-in" }
    : (formattedStops[0] ? { lat: formattedStops[0].lat, lng: formattedStops[0].lng, lastUpdated: "Planned" } : { lat: 23.8103, lng: 90.4125, lastUpdated: "Planned" });

  return {
    id: plan.tour_plan_id,
    title: plan.title,
    description: plan.description || "",
    startingLocation: plan.starting_location || "Dhaka",
    destination: plan.destination || "Sylhet",
    startDate: plan.travel_start_date ? new Date(plan.travel_start_date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
    endDate: plan.travel_end_date ? new Date(plan.travel_end_date).toISOString().split("T")[0] : new Date(Date.now() + 4 * 86400000).toISOString().split("T")[0],
    durationDays: plan.duration_days || 3,
    targetBudget: Number(plan.total_budget || 25000),
    spentBudget: spentBudget,
    status: plan.status || "planned", // 'planned' | 'ongoing' | 'completed'
    travelType: plan.travel_type || "Friends",
    season: plan.season || "Monsoon",
    transportation: plan.transportation || "Bus",
    accommodationType: plan.accommodation_type || "Hotel",
    coverImage: plan.cover_image || "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
    author: {
      id: plan.user_id,
      name: authorName,
      username: plan.username || "traveler",
      avatar: authorAvatar,
      league: calculateLeague(authorPoints),
      points: authorPoints
    },
    companions: formattedCompanions,
    stops: formattedStops,
    expenses: formattedExpenses,
    currentGps: currentGps,
    likes: plan.likes_count || 0,
    comments: plan.comments_count || 0,
    rating: Number(plan.rating_avg || 5.0),
    ratingCount: plan.rating_count || 0,
    saves: plan.saves_count || 0,
    hasLiked: userLikes.has(plan.tour_plan_id),
    hasSaved: userSaves.has(plan.tour_plan_id),
    isPublished: Boolean(plan.social_post_id),
    socialPostId: plan.social_post_id || null,
    actualStartedAt: plan.actual_started_at || null,
    actualEndedAt: plan.actual_ended_at || null,
    createdAt: plan.created_at
  };
}

/**
 * GET /api/tour-plans
 * Fetch all tour plans with multi-criteria filters
 */
export async function getAllTourPlans(req, res) {
  try {
    const {
      status,
      travelType,
      season,
      transportation,
      destination,
      search,
      userId,
      maxBudget,
      sortBy = "created_at",
      limit = 50,
      offset = 0,
      currentUserId
    } = req.query;

    let conditions = ["1=1"];
    let params = [];

    if (status && status !== "all") {
      conditions.push("p.status = ?");
      params.push(status);
    }
    if (travelType && travelType !== "All") {
      conditions.push("p.travel_type = ?");
      params.push(travelType);
    }
    if (season && season !== "All") {
      conditions.push("p.season = ?");
      params.push(season);
    }
    if (transportation && transportation !== "All") {
      conditions.push("p.transportation = ?");
      params.push(transportation);
    }
    if (destination && destination !== "All") {
      conditions.push("LOWER(p.destination) LIKE ?");
      params.push(`%${destination.toLowerCase()}%`);
    }
    if (search && search.trim()) {
      conditions.push("(LOWER(p.title) LIKE ? OR LOWER(p.destination) LIKE ? OR LOWER(p.starting_location) LIKE ?)");
      const term = `%${search.toLowerCase().trim()}%`;
      params.push(term, term, term);
    }
    if (userId) {
      conditions.push("p.user_id = ?");
      params.push(userId);
    }
    if (maxBudget) {
      conditions.push("p.total_budget <= ?");
      params.push(Number(maxBudget));
    }

    let orderClause = "p.created_at DESC";
    if (sortBy === "rating") orderClause = "p.rating_avg DESC, p.rating_count DESC";
    if (sortBy === "budget_low") orderClause = "p.total_budget ASC";
    if (sortBy === "budget_high") orderClause = "p.total_budget DESC";
    if (sortBy === "likes") orderClause = "p.likes_count DESC";

    const sql = `
      SELECT 
        p.*,
        u.username,
        u.first_name,
        u.last_name,
        u.profile_picture_url,
        u.league_points
      FROM tour_plans p
      LEFT JOIN users u ON p.user_id = u.user_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const plansRaw = await query(sql, params);

    if (plansRaw.length === 0) {
      return res.json({ success: true, expeditions: [], total: 0 });
    }

    const planIds = plansRaw.map(p => p.tour_plan_id);
    const placeholders = planIds.map(() => "?").join(",");

    // Fetch stops
    const stopsRaw = await query(
      `SELECT * FROM tour_plan_places_modified WHERE tour_plan_id IN (${placeholders}) ORDER BY stop_order ASC`,
      planIds
    );

    // Fetch members
    const membersRaw = await query(
      `SELECT * FROM tour_plan_members WHERE tour_plan_id IN (${placeholders})`,
      planIds
    );

    // Fetch expenses
    const expensesRaw = await query(
      `SELECT * FROM tour_plan_expenses WHERE tour_plan_id IN (${placeholders}) ORDER BY created_at ASC`,
      planIds
    );

    // User interactions
    const userLikes = new Set();
    const userSaves = new Set();
    if (currentUserId) {
      const likes = await query(
        `SELECT tour_plan_id FROM post_likes WHERE user_id = ? AND liked_type = 'tour_plan' AND tour_plan_id IN (${placeholders})`,
        [currentUserId, ...planIds]
      );
      likes.forEach(l => userLikes.add(l.tour_plan_id));

      const saves = await query(
        `SELECT tour_plan_id FROM saved_posts WHERE user_id = ? AND saved_type = 'tour_plan' AND tour_plan_id IN (${placeholders})`,
        [currentUserId, ...planIds]
      );
      saves.forEach(s => userSaves.add(s.tour_plan_id));
    }

    const formatted = plansRaw.map(plan => 
      formatTourPlan(plan, stopsRaw, membersRaw, expensesRaw, currentUserId, userLikes, userSaves)
    );

    res.json({
      success: true,
      expeditions: formatted,
      total: formatted.length
    });
  } catch (error) {
    console.error("Error in getAllTourPlans:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/tour-plans/:id
 * Fetch a single tour plan with all stops, members, and expenses
 */
export async function getTourPlanById(req, res) {
  try {
    const { id } = req.params;
    const { currentUserId } = req.query;

    const [plan] = await query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_picture_url, u.league_points
       FROM tour_plans p
       LEFT JOIN users u ON p.user_id = u.user_id
       WHERE p.tour_plan_id = ? LIMIT 1`,
      [id]
    );

    if (!plan) {
      return res.status(404).json({ success: false, message: "Tour plan not found" });
    }

    const stopsRaw = await query(
      "SELECT * FROM tour_plan_places_modified WHERE tour_plan_id = ? ORDER BY stop_order ASC",
      [id]
    );

    const membersRaw = await query(
      "SELECT * FROM tour_plan_members WHERE tour_plan_id = ?",
      [id]
    );

    const expensesRaw = await query(
      "SELECT * FROM tour_plan_expenses WHERE tour_plan_id = ? ORDER BY created_at ASC",
      [id]
    );

    const userLikes = new Set();
    const userSaves = new Set();
    if (currentUserId) {
      const likes = await query(
        "SELECT tour_plan_id FROM post_likes WHERE user_id = ? AND tour_plan_id = ? AND liked_type = 'tour_plan'",
        [currentUserId, id]
      );
      if (likes.length > 0) userLikes.add(id);

      const saves = await query(
        "SELECT tour_plan_id FROM saved_posts WHERE user_id = ? AND tour_plan_id = ? AND saved_type = 'tour_plan'",
        [currentUserId, id]
      );
      if (saves.length > 0) userSaves.add(id);
    }

    const formatted = formatTourPlan(plan, stopsRaw, membersRaw, expensesRaw, currentUserId, userLikes, userSaves);

    res.json({ success: true, expedition: formatted });
  } catch (error) {
    console.error("Error in getTourPlanById:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/tour-plans
 * Create a new Tour Plan with sequenced stops, accommodation, and companions
 */
export async function createTourPlan(req, res) {
  try {
    const {
      title,
      description,
      startingLocation,
      destination,
      startDate,
      endDate,
      targetBudget,
      spentBudget,
      totalCost,
      travelType,
      season,
      transportation,
      coverImage,
      author,
      companions = [],
      stops = [],
      expenses = [],
      status = "planned"
    } = req.body;

    const userId = await ensureUserExists(author);
    const tourPlanId = req.body.id || req.body.tourPlanId || ("exp_" + Date.now());
    const computedSpentBudget = Number(spentBudget ?? totalCost ?? 0);

    // 1. Insert into tour_plans
    await query(`
      INSERT INTO tour_plans (
        tour_plan_id, user_id, title, description, starting_location, destination,
        travel_start_date, travel_end_date, total_budget, spent_budget,
        travel_type, season, transportation, cover_image, status, is_public
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        description = VALUES(description),
        starting_location = VALUES(starting_location),
        destination = VALUES(destination),
        travel_start_date = VALUES(travel_start_date),
        travel_end_date = VALUES(travel_end_date),
        total_budget = VALUES(total_budget),
        spent_budget = VALUES(spent_budget),
        travel_type = VALUES(travel_type),
        season = VALUES(season),
        transportation = VALUES(transportation),
        cover_image = VALUES(cover_image),
        status = VALUES(status)
    `, [
      tourPlanId,
      userId,
      title || `${startingLocation || 'Dhaka'} to ${destination || 'Sylhet'} Tour`,
      description || "",
      startingLocation || "Dhaka",
      destination || "Sylhet",
      startDate || new Date().toISOString().split("T")[0],
      endDate || new Date(Date.now() + 4 * 86400000).toISOString().split("T")[0],
      Number(targetBudget) || 25000,
      computedSpentBudget,
      travelType || "Friends",
      season || "Monsoon",
      transportation || "Bus",
      coverImage || "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
      status
    ]);

    // 2. Insert Stops into tour_plan_places_modified
    if (Array.isArray(stops) && stops.length > 0) {
      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        const stopId = s.id || s.tour_plan_place_id || `stop_${Date.now()}_${i}`;
        const photosJson = JSON.stringify(s.photos || []);
        const stopExpense = Number(s.expense ?? (Number(s.transportCost || s.transport_cost || 0) + Number(s.accommodationCost || s.accommodation_cost || 0)));
        let validPlaceId = null;
        const candidateId = s.placeId || s.place_id;
        if (candidateId && typeof candidateId === "string" && candidateId.startsWith("place_")) {
          validPlaceId = candidateId;
        }

        await query(`
          INSERT INTO tour_plan_places_modified (
            tour_plan_place_id, tour_plan_id, place_id, place_name, location,
            stop_order, latitude, longitude, transport_mode, transport_details,
            transport_cost, has_accommodation, accommodation_type, accommodation_name,
            accommodation_cost, accommodation_details, stay_duration, notes,
            status, is_spontaneous, discovery_badge, photos, Expense
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            place_name = VALUES(place_name),
            location = VALUES(location),
            stop_order = VALUES(stop_order),
            latitude = VALUES(latitude),
            longitude = VALUES(longitude),
            transport_mode = VALUES(transport_mode),
            transport_details = VALUES(transport_details),
            transport_cost = VALUES(transport_cost),
            has_accommodation = VALUES(has_accommodation),
            accommodation_type = VALUES(accommodation_type),
            accommodation_name = VALUES(accommodation_name),
            accommodation_cost = VALUES(accommodation_cost),
            accommodation_details = VALUES(accommodation_details),
            stay_duration = VALUES(stay_duration),
            notes = VALUES(notes),
            status = VALUES(status),
            is_spontaneous = VALUES(is_spontaneous),
            discovery_badge = VALUES(discovery_badge),
            photos = VALUES(photos),
            Expense = VALUES(Expense)
        `, [
          stopId,
          tourPlanId,
          validPlaceId,
          s.placeName || s.place_name || s.name || s.location || `Stop ${i + 1}`,
          s.location || s.placeName || s.place_name || "",
          s.order || s.stop_order || (i + 1),
          Number(s.lat ?? s.latitude ?? 23.8103),
          Number(s.lng ?? s.longitude ?? 90.4125),
          s.transportMode || s.transport_mode || "Bus",
          s.transportDetails || s.transport_details || "",
          Number(s.transportCost || s.transport_cost || 0),
          (s.hasAccommodation || s.has_accommodation) ? 1 : 0,
          s.accommodationType || s.accommodation_type || "Hotel",
          s.accommodationName || s.accommodation_name || "",
          Number(s.accommodationCost || s.accommodation_cost || 0),
          s.accommodationDetails || s.accommodation_details || "",
          s.stayDuration || s.stay_duration || "1 Night",
          s.notes || "",
          s.status || "pending",
          s.isSpontaneous ? 1 : 0,
          s.discoveryBadge || s.discovery_badge || "",
          photosJson,
          stopExpense
        ]);
      }
    }

    // 3. Insert Companions into tour_plan_members
    if (Array.isArray(companions) && companions.length > 0) {
      for (let i = 0; i < companions.length; i++) {
        const c = companions[i];
        const memberId = c.id || `mem_${Date.now()}_${i}`;
        await query(`
          INSERT INTO tour_plan_members (
            id, tour_plan_id, user_id, name, username, avatar, phone, role, invite_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          memberId,
          tourPlanId,
          c.userId || c.id || null,
          c.name || "Companion",
          c.username || "traveler",
          c.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${c.name || 'companion'}`,
          c.phone || "",
          c.role || "Member",
          c.inviteStatus || "accepted"
        ]);
      }
    }

    // 4. Award Gamification Points (+75 points for creating a plan)
    await query(
      "UPDATE users SET league_points = league_points + 75, total_trips_shared = total_trips_shared + 1 WHERE user_id = ?",
      [userId]
    );

    // Fetch and format newly created tour
    const [createdPlan] = await query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_picture_url, u.league_points
       FROM tour_plans p
       LEFT JOIN users u ON p.user_id = u.user_id
       WHERE p.tour_plan_id = ?`,
      [tourPlanId]
    );
    const createdStops = await query("SELECT * FROM tour_plan_places_modified WHERE tour_plan_id = ?", [tourPlanId]);
    const createdMembers = await query("SELECT * FROM tour_plan_members WHERE tour_plan_id = ?", [tourPlanId]);

    const formatted = formatTourPlan(createdPlan, createdStops, createdMembers, []);

    // Broadcast WebSocket event
    try {
      getIO().emit("tour:created", formatted);
    } catch (e) {}

    res.status(201).json({
      success: true,
      message: "Tour plan created successfully!",
      expedition: formatted
    });
  } catch (error) {
    console.error("Error in createTourPlan:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * PUT /api/tour-plans/:id
 * Update an existing tour plan and synchronize its stops & members
 */
export async function updateTourPlan(req, res) {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      startingLocation,
      destination,
      startDate,
      endDate,
      targetBudget,
      spentBudget,
      travelType,
      season,
      transportation,
      coverImage,
      status,
      socialPostId,
      stops,
      companions
    } = req.body;

    const [existing] = await query("SELECT * FROM tour_plans WHERE tour_plan_id = ?", [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Tour plan not found" });
    }

    // Update main fields
    await query(`
      UPDATE tour_plans SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        starting_location = COALESCE(?, starting_location),
        destination = COALESCE(?, destination),
        travel_start_date = COALESCE(?, travel_start_date),
        travel_end_date = COALESCE(?, travel_end_date),
        total_budget = COALESCE(?, total_budget),
        spent_budget = COALESCE(?, spent_budget),
        travel_type = COALESCE(?, travel_type),
        season = COALESCE(?, season),
        transportation = COALESCE(?, transportation),
        cover_image = COALESCE(?, cover_image),
        status = COALESCE(?, status),
        social_post_id = COALESCE(?, social_post_id)
      WHERE tour_plan_id = ?
    `, [
      title,
      description,
      startingLocation,
      destination,
      startDate,
      endDate,
      targetBudget ? Number(targetBudget) : null,
      spentBudget !== undefined ? Number(spentBudget) : null,
      travelType,
      season,
      transportation,
      coverImage,
      status,
      socialPostId,
      id
    ]);

    // If stops are sent, sync stops
    if (Array.isArray(stops)) {
      // Delete old stops and insert updated ones
      await query("DELETE FROM tour_plan_places_modified WHERE tour_plan_id = ?", [id]);
      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        const stopId = s.id || s.tour_plan_place_id || `stop_${Date.now()}_${i}`;
        const photosJson = JSON.stringify(s.photos || []);
        const stopExpense = Number(s.expense ?? (Number(s.transportCost || s.transport_cost || 0) + Number(s.accommodationCost || s.accommodation_cost || 0)));
        let validPlaceId = null;
        const candidateId = s.placeId || s.place_id;
        if (candidateId && typeof candidateId === "string" && candidateId.startsWith("place_")) {
          validPlaceId = candidateId;
        }

        await query(`
          INSERT INTO tour_plan_places_modified (
            tour_plan_place_id, tour_plan_id, place_id, place_name, location,
            stop_order, latitude, longitude, transport_mode, transport_details,
            transport_cost, has_accommodation, accommodation_type, accommodation_name,
            accommodation_cost, accommodation_details, stay_duration, notes,
            status, is_spontaneous, discovery_badge, check_in_time, check_in_lat,
            check_in_lng, check_in_note, photos, Expense
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          stopId,
          id,
          validPlaceId,
          s.placeName || s.place_name || s.name || s.location || `Stop ${i + 1}`,
          s.location || s.placeName || s.place_name || "",
          s.order || s.stop_order || (i + 1),
          Number(s.lat ?? s.latitude ?? 23.8103),
          Number(s.lng ?? s.longitude ?? 90.4125),
          s.transportMode || s.transport_mode || "Bus",
          s.transportDetails || s.transport_details || "",
          Number(s.transportCost || s.transport_cost || 0),
          (s.hasAccommodation || s.has_accommodation) ? 1 : 0,
          s.accommodationType || s.accommodation_type || "Hotel",
          s.accommodationName || s.accommodation_name || "",
          Number(s.accommodationCost || s.accommodation_cost || 0),
          s.accommodationDetails || s.accommodation_details || "",
          s.stayDuration || s.stay_duration || "1 Night",
          s.notes || "",
          s.status || "pending",
          s.isSpontaneous ? 1 : 0,
          s.discoveryBadge || s.discovery_badge || "",
          s.checkInTime || null,
          s.checkInGps?.lat || s.check_in_lat || null,
          s.checkInGps?.lng || s.check_in_lng || null,
          s.checkInNote || s.check_in_note || "",
          photosJson,
          stopExpense
        ]);
      }
    }

    // If companions are sent, sync companions
    if (Array.isArray(companions)) {
      await query("DELETE FROM tour_plan_members WHERE tour_plan_id = ?", [id]);
      for (let i = 0; i < companions.length; i++) {
        const c = companions[i];
        const memberId = c.id || `mem_${Date.now()}_${i}`;
        await query(`
          INSERT INTO tour_plan_members (
            id, tour_plan_id, user_id, name, username, avatar, phone, role, invite_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          memberId,
          id,
          c.userId || c.id || null,
          c.name || "Companion",
          c.username || "traveler",
          c.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${c.name}`,
          c.phone || "",
          c.role || "Member",
          c.inviteStatus || "accepted"
        ]);
      }
    }

    // Fetch updated
    const [updatedPlan] = await query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_picture_url, u.league_points
       FROM tour_plans p
       LEFT JOIN users u ON p.user_id = u.user_id
       WHERE p.tour_plan_id = ?`,
      [id]
    );
    const updatedStops = await query("SELECT * FROM tour_plan_places_modified WHERE tour_plan_id = ? ORDER BY stop_order ASC", [id]);
    const updatedMembers = await query("SELECT * FROM tour_plan_members WHERE tour_plan_id = ?", [id]);
    const updatedExpenses = await query("SELECT * FROM tour_plan_expenses WHERE tour_plan_id = ?", [id]);

    const formatted = formatTourPlan(updatedPlan, updatedStops, updatedMembers, updatedExpenses);

    try {
      getIO().emit("tour:updated", formatted);
    } catch (e) {}

    res.json({ success: true, expedition: formatted });
  } catch (error) {
    console.error("Error in updateTourPlan:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * DELETE /api/tour-plans/:id
 * Delete a tour plan
 */
export async function deleteTourPlan(req, res) {
  try {
    const { id } = req.params;
    await query("DELETE FROM tour_plans WHERE tour_plan_id = ?", [id]);

    try {
      getIO().emit("tour:deleted", { id });
    } catch (e) {}

    res.json({ success: true, message: "Tour plan deleted successfully" });
  } catch (error) {
    console.error("Error in deleteTourPlan:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * PATCH /api/tour-plans/:id/start
 * Start expedition (transitions to 'ongoing' and awards +50 points)
 */
export async function startTourPlan(req, res) {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    await query("UPDATE tour_plans SET status = 'ongoing', actual_started_at = NOW() WHERE tour_plan_id = ?", [id]);

    if (userId) {
      await query("UPDATE users SET league_points = league_points + 50 WHERE user_id = ?", [userId]);
    }

    const [updatedPlan] = await query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_picture_url, u.league_points
       FROM tour_plans p
       LEFT JOIN users u ON p.user_id = u.user_id
       WHERE p.tour_plan_id = ?`,
      [id]
    );
    const updatedStops = await query("SELECT * FROM tour_plan_places_modified WHERE tour_plan_id = ? ORDER BY stop_order ASC", [id]);
    const updatedMembers = await query("SELECT * FROM tour_plan_members WHERE tour_plan_id = ?", [id]);
    const updatedExpenses = await query("SELECT * FROM tour_plan_expenses WHERE tour_plan_id = ?", [id]);

    const formatted = formatTourPlan(updatedPlan, updatedStops, updatedMembers, updatedExpenses);

    try {
      getIO().emit("tour:started", { id, status: "ongoing", startedAt: new Date().toISOString(), expedition: formatted });
    } catch (e) {}

    res.json({ success: true, message: "Tour is now ongoing!", expedition: formatted });
  } catch (error) {
    console.error("Error in startTourPlan:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * PATCH /api/tour-plans/:id/end
 * End expedition (transitions to 'completed' and awards +100 points)
 */
export async function endTourPlan(req, res) {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    await query("UPDATE tour_plans SET status = 'completed', actual_ended_at = NOW() WHERE tour_plan_id = ?", [id]);

    if (userId) {
      await query("UPDATE users SET league_points = league_points + 100 WHERE user_id = ?", [userId]);
    }

    const [updatedPlan] = await query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_picture_url, u.league_points
       FROM tour_plans p
       LEFT JOIN users u ON p.user_id = u.user_id
       WHERE p.tour_plan_id = ?`,
      [id]
    );
    const updatedStops = await query("SELECT * FROM tour_plan_places_modified WHERE tour_plan_id = ? ORDER BY stop_order ASC", [id]);
    const updatedMembers = await query("SELECT * FROM tour_plan_members WHERE tour_plan_id = ?", [id]);
    const updatedExpenses = await query("SELECT * FROM tour_plan_expenses WHERE tour_plan_id = ?", [id]);

    const formatted = formatTourPlan(updatedPlan, updatedStops, updatedMembers, updatedExpenses);

    try {
      getIO().emit("tour:completed", { id, status: "completed", endedAt: new Date().toISOString(), expedition: formatted });
    } catch (e) {}

    res.json({ success: true, message: "Tour has been marked completed! Congratulations on the expedition.", expedition: formatted });
  } catch (error) {
    console.error("Error in endTourPlan:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * PATCH /api/tour-plans/:id/restart
 * Restart an expedition: resets status to 'ongoing', resets all stops back to 'pending', clears check-in data and previous expenses
 */
export async function restartTourPlan(req, res) {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    // Reset tour plan status & actual timestamps
    await query("UPDATE tour_plans SET status = 'ongoing', actual_started_at = NOW(), actual_ended_at = NULL WHERE tour_plan_id = ?", [id]);

    // Reset all itinerary stops to pending and clear live check-in telemetry
    await query(`
      UPDATE tour_plan_places_modified 
      SET status = 'pending', check_in_time = NULL, check_in_lat = NULL, check_in_lng = NULL, check_in_note = NULL
      WHERE tour_plan_id = ?
    `, [id]);

    // Clear previous live expenses
    await query("DELETE FROM tour_plan_expenses WHERE tour_plan_id = ?", [id]);

    if (userId) {
      await query("UPDATE users SET league_points = league_points + 25 WHERE user_id = ?", [userId]);
    }

    const [updatedPlan] = await query(
      `SELECT p.*, u.username, u.first_name, u.last_name, u.profile_picture_url, u.league_points
       FROM tour_plans p
       LEFT JOIN users u ON p.user_id = u.user_id
       WHERE p.tour_plan_id = ?`,
      [id]
    );
    const updatedStops = await query("SELECT * FROM tour_plan_places_modified WHERE tour_plan_id = ? ORDER BY stop_order ASC", [id]);
    const updatedMembers = await query("SELECT * FROM tour_plan_members WHERE tour_plan_id = ?", [id]);
    const updatedExpenses = await query("SELECT * FROM tour_plan_expenses WHERE tour_plan_id = ?", [id]);

    const formatted = formatTourPlan(updatedPlan, updatedStops, updatedMembers, updatedExpenses);

    try {
      getIO().emit("tour:restarted", { id, status: "ongoing", restartedAt: new Date().toISOString(), expedition: formatted });
    } catch (e) {}

    res.json({ success: true, message: "Tour has been restarted successfully and is now active in Live Cockpit!", expedition: formatted });
  } catch (error) {
    console.error("Error in restartTourPlan:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/tour-plans/:id/stops/checkin
 * Live GPS check-in at a planned stop
 */
export async function checkInStop(req, res) {
  try {
    const { id } = req.params;
    const { stopId, gps, note, photos, expense, userId } = req.body;

    if (!stopId) {
      return res.status(400).json({ success: false, message: "Stop ID is required for check-in." });
    }

    const checkInTime = new Date().toISOString();
    const photosJson = photos ? JSON.stringify(photos) : null;

    await query(`
      UPDATE tour_plan_places_modified SET
        status = 'checked_in',
        check_in_time = NOW(),
        check_in_lat = COALESCE(?, latitude),
        check_in_lng = COALESCE(?, longitude),
        check_in_note = COALESCE(?, notes),
        photos = COALESCE(?, photos)
      WHERE tour_plan_place_id = ? AND tour_plan_id = ?
    `, [
      gps?.lat || null,
      gps?.lng || null,
      note || null,
      photosJson,
      stopId,
      id
    ]);

    // If an expense was logged at check-in
    if (expense && Number(expense.amount) > 0) {
      const expId = "exp_" + Date.now();
      await query(`
        INSERT INTO tour_plan_expenses (expense_id, tour_plan_id, stop_id, category, amount, note, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        expId,
        id,
        stopId,
        expense.category || "Accommodation",
        Number(expense.amount),
        expense.note || `Expense logged at check-in`,
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      ]);

      await query("UPDATE tour_plans SET spent_budget = spent_budget + ? WHERE tour_plan_id = ?", [
        Number(expense.amount),
        id
      ]);
    }

    // Award +35 points for live check-in
    if (userId) {
      await query("UPDATE users SET league_points = league_points + 35 WHERE user_id = ?", [userId]);
    }

    // Automatically resequence all tour stops so the sequence is based on actual check-in time!
    await resequenceTourStops(id);

    // Fetch refreshed and resequenced stops
    const allStopsRaw = await query(
      "SELECT * FROM tour_plan_places_modified WHERE tour_plan_id = ? ORDER BY stop_order ASC",
      [id]
    );
    const formattedStops = sortAndFormatStops(allStopsRaw);

    const payload = {
      tourId: id,
      stopId,
      gps: gps || null,
      checkInTime,
      note: note || "",
      photos: photos || [],
      stops: formattedStops
    };

    try {
      getIO().emit("tour:stop_checked_in", payload);
    } catch (e) {}

    res.json({ 
      success: true, 
      message: "Checked in successfully! Sequence updated based on your check-in time.", 
      checkInData: payload,
      stops: formattedStops
    });
  } catch (error) {
    console.error("Error in checkInStop:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * PATCH /api/tour-plans/:id/stops/:stopId/skip
 * Skip a scheduled stop
 */
export async function skipStop(req, res) {
  try {
    const { id, stopId } = req.params;
    const { reason = "Route altered due to time / weather" } = req.body;

    await query(`
      UPDATE tour_plan_places_modified SET
        status = 'skipped',
        notes = CONCAT(COALESCE(notes, ''), ' [Skipped: ', ?, ']')
      WHERE tour_plan_place_id = ? AND tour_plan_id = ?
    `, [reason, stopId, id]);

    try {
      getIO().emit("tour:stop_skipped", { tourId: id, stopId, reason });
    } catch (e) {}

    res.json({ success: true, message: "Stop marked as skipped." });
  } catch (error) {
    console.error("Error in skipStop:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/tour-plans/:id/stops/spontaneous
 * Add an unexpected on-the-road discovery directly in 'checked_in' status
 */
export async function addSpontaneousStop(req, res) {
  try {
    const { id } = req.params;
    const {
      id: customId,
      stopId: customStopId,
      insertAfterStopId,
      insertAfterOrder,
      placeName,
      location,
      lat,
      lng,
      transportMode,
      transportDetails,
      transportCost,
      accommodationType,
      accommodationDetails,
      accommodationCost,
      stayDuration,
      notes,
      discoveryBadge,
      photos = [],
      expense,
      userId
    } = req.body;

    const stopId = customStopId || customId || ("stop_spont_" + Date.now());

    // Check if this stop ID or exact spontaneous stop was already inserted within the past 30 seconds
    const [alreadyExists] = await query(
      "SELECT * FROM tour_plan_places_modified WHERE tour_plan_id = ? AND (tour_plan_place_id = ? OR (is_spontaneous = 1 AND place_name = ? AND TIMESTAMPDIFF(SECOND, check_in_time, NOW()) < 30)) LIMIT 1",
      [id, stopId, placeName || "Uncharted Scenic Spot"]
    );

    if (alreadyExists) {
      return res.json({
        success: true,
        message: "Spontaneous discovery already recorded.",
        stop: {
          id: alreadyExists.tour_plan_place_id,
          order: alreadyExists.stop_order,
          placeName: alreadyExists.place_name,
          location: alreadyExists.location,
          lat: Number(alreadyExists.latitude),
          lng: Number(alreadyExists.longitude),
          status: alreadyExists.status,
          isSpontaneous: true
        }
      });
    }

    // Determine target sequence position (insert between two places)
    let targetOrder = null;

    if (insertAfterOrder !== undefined && insertAfterOrder !== null && !isNaN(Number(insertAfterOrder))) {
      targetOrder = Number(insertAfterOrder) + 1;
    } else if (insertAfterStopId) {
      const [refStop] = await query(
        "SELECT stop_order FROM tour_plan_places_modified WHERE tour_plan_id = ? AND tour_plan_place_id = ? LIMIT 1",
        [id, insertAfterStopId]
      );
      if (refStop && refStop.stop_order != null) {
        targetOrder = Number(refStop.stop_order) + 1;
      }
    }

    if (targetOrder === null) {
      // Find the last completed / checked-in stop
      const [lastChecked] = await query(
        "SELECT MAX(stop_order) as maxOrder FROM tour_plan_places_modified WHERE tour_plan_id = ? AND status = 'checked_in'",
        [id]
      );
      if (lastChecked && lastChecked.maxOrder != null) {
        targetOrder = Number(lastChecked.maxOrder) + 1;
      } else {
        // If no stops are checked in, insert after departure (order 2) if stops exist, else order 1
        const [firstStop] = await query(
          "SELECT MIN(stop_order) as minOrder, COUNT(*) as cnt FROM tour_plan_places_modified WHERE tour_plan_id = ?",
          [id]
        );
        if (firstStop && firstStop.cnt > 0) {
          targetOrder = Number(firstStop.minOrder) + 1;
        } else {
          targetOrder = 1;
        }
      }
    }

    // Shift all subsequent stops down by +1 to make room for this spontaneous detour
    await query(
      "UPDATE tour_plan_places_modified SET stop_order = stop_order + 1 WHERE tour_plan_id = ? AND stop_order >= ?",
      [id, targetOrder]
    );

    const photosJson = JSON.stringify(photos.length > 0 ? photos : ["https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500"]);

    await query(`
      INSERT INTO tour_plan_places_modified (
        tour_plan_place_id, tour_plan_id, place_name, location, stop_order,
        latitude, longitude, transport_mode, transport_details, transport_cost,
        has_accommodation, accommodation_type, accommodation_name, accommodation_cost,
        accommodation_details, stay_duration, notes, status, is_spontaneous,
        discovery_badge, check_in_time, check_in_lat, check_in_lng, check_in_note,
        photos, Expense
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'checked_in', 1, ?, NOW(), ?, ?, ?, ?, ?)
    `, [
      stopId,
      id,
      placeName || "Uncharted Scenic Spot",
      location || "On Route Discovery",
      targetOrder,
      lat || 24.3000,
      lng || 91.8000,
      transportMode || "Local Transport",
      transportDetails || "Spontaneous road trip detour",
      Number(transportCost || 0),
      accommodationType ? 1 : 0,
      accommodationType || "Eco Cottage",
      placeName || "Local Cottage",
      Number(accommodationCost || 0),
      accommodationDetails || "Local discovery",
      stayDuration || "2 Hours",
      notes || "Spontaneous on-the-road discovery found by travelers!",
      discoveryBadge || "Hidden Gem",
      lat || 24.3000,
      lng || 91.8000,
      notes || "Discovered on the road!",
      photosJson,
      Number(expense?.amount || 0)
    ]);

    // If an expense was logged
    if (expense && Number(expense.amount) > 0) {
      const expId = "exp_" + Date.now();
      await query(`
        INSERT INTO tour_plan_expenses (expense_id, tour_plan_id, stop_id, category, amount, note, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        expId,
        id,
        stopId,
        expense.category || "Activities",
        Number(expense.amount),
        `Spontaneous: ${placeName}`,
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      ]);

      await query("UPDATE tour_plans SET spent_budget = spent_budget + ? WHERE tour_plan_id = ?", [
        Number(expense.amount),
        id
      ]);
    }

    // Award +50 points for discovering a spontaneous hidden gem
    if (userId) {
      await query("UPDATE users SET league_points = league_points + 50 WHERE user_id = ?", [userId]);
    }

    // Resequence all tour stops based on actual check-in sequence
    await resequenceTourStops(id);

    // Fetch refreshed, properly ordered stops
    const allStopsRaw = await query(
      "SELECT * FROM tour_plan_places_modified WHERE tour_plan_id = ? ORDER BY stop_order ASC",
      [id]
    );

    const allStopsFormatted = sortAndFormatStops(allStopsRaw);

    const createdStop = allStopsFormatted.find(s => s.id === stopId) || {
      id: stopId,
      order: targetOrder,
      placeName: placeName || "Uncharted Scenic Spot",
      location: location || "On Route Discovery",
      lat: Number(lat || 24.3000),
      lng: Number(lng || 91.8000),
      transportMode: transportMode || "Local Transport",
      transportDetails: transportDetails || "Spontaneous road trip detour",
      transportCost: Number(transportCost || 0),
      accommodationType: accommodationType || "Eco Cottage",
      accommodationDetails: accommodationDetails || "Local discovery",
      accommodationCost: Number(accommodationCost || 0),
      stayDuration: stayDuration || "2 Hours",
      notes: notes || "Spontaneous discovery logged!",
      status: "checked_in",
      isSpontaneous: true,
      discoveryBadge: discoveryBadge || "Hidden Gem",
      checkInTime: new Date().toISOString(),
      checkInGps: { lat: Number(lat || 24.3000), lng: Number(lng || 91.8000) },
      checkInNote: notes || "Discovered on the road!",
      photos: photos
    };

    try {
      getIO().emit("tour:spontaneous_stop_added", { tourId: id, stop: createdStop, stops: allStopsFormatted });
    } catch (e) {}

    res.status(201).json({
      success: true,
      message: "Spontaneous discovery recorded and pinned to route map in sequence!",
      stop: createdStop,
      stops: allStopsFormatted
    });
  } catch (error) {
    console.error("Error in addSpontaneousStop:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/tour-plans/:id/expenses
 * Add an expense to a tour plan
 */
export async function addTourExpense(req, res) {
  try {
    const { id } = req.params;
    const { stopId, category, amount, note } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Valid expense amount is required." });
    }

    const expenseId = "exp_" + Date.now();
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    await query(`
      INSERT INTO tour_plan_expenses (expense_id, tour_plan_id, stop_id, category, amount, note, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      expenseId,
      id,
      stopId || null,
      category || "General",
      Number(amount),
      note || "",
      timestamp
    ]);

    await query("UPDATE tour_plans SET spent_budget = spent_budget + ? WHERE tour_plan_id = ?", [
      Number(amount),
      id
    ]);

    const newExpense = {
      id: expenseId,
      stopId: stopId || null,
      category: category || "General",
      amount: Number(amount),
      note: note || "",
      timestamp
    };

    try {
      getIO().emit("tour:expense_added", { tourId: id, expense: newExpense });
    } catch (e) {}

    res.status(201).json({ success: true, expense: newExpense });
  } catch (error) {
    console.error("Error in addTourExpense:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * DELETE /api/tour-plans/:id/expenses/:expenseId
 * Remove an expense
 */
export async function deleteTourExpense(req, res) {
  try {
    const { id, expenseId } = req.params;

    const [expenseRow] = await query("SELECT amount FROM tour_plan_expenses WHERE expense_id = ? AND tour_plan_id = ?", [expenseId, id]);
    if (expenseRow) {
      await query("UPDATE tour_plans SET spent_budget = GREATEST(0, spent_budget - ?) WHERE tour_plan_id = ?", [
        Number(expenseRow.amount),
        id
      ]);
    }

    await query("DELETE FROM tour_plan_expenses WHERE expense_id = ? AND tour_plan_id = ?", [expenseId, id]);

    try {
      getIO().emit("tour:expense_deleted", { tourId: id, expenseId });
    } catch (e) {}

    res.json({ success: true, message: "Expense removed successfully." });
  } catch (error) {
    console.error("Error in deleteTourExpense:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/tour-plans/:id/like
 * Toggle like for a tour plan
 */
export async function toggleLikeTourPlan(req, res) {
  try {
    const { id } = req.params;
    const { user } = req.body;

    const userId = await ensureUserExists(user);
    const [existing] = await query(
      "SELECT like_id FROM post_likes WHERE user_id = ? AND tour_plan_id = ? AND liked_type = 'tour_plan'",
      [userId, id]
    );

    let hasLiked = false;
    if (existing) {
      await query("DELETE FROM post_likes WHERE like_id = ?", [existing.like_id]);
      await query("UPDATE tour_plans SET likes_count = GREATEST(0, likes_count - 1) WHERE tour_plan_id = ?", [id]);
      hasLiked = false;
    } else {
      const likeId = "like_" + Date.now();
      await query(
        "INSERT INTO post_likes (like_id, user_id, tour_plan_id, liked_type) VALUES (?, ?, ?, 'tour_plan')",
        [likeId, userId, id]
      );
      await query("UPDATE tour_plans SET likes_count = likes_count + 1 WHERE tour_plan_id = ?", [id]);
      hasLiked = true;
    }

    const [updated] = await query("SELECT likes_count FROM tour_plans WHERE tour_plan_id = ?", [id]);

    res.json({
      success: true,
      hasLiked,
      likesCount: updated?.likes_count || 0
    });
  } catch (error) {
    console.error("Error in toggleLikeTourPlan:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/tour-plans/:id/save
 * Toggle save / bookmark for a tour plan
 */
export async function toggleSaveTourPlan(req, res) {
  try {
    const { id } = req.params;
    const { user } = req.body;

    const userId = await ensureUserExists(user);
    const [existing] = await query(
      "SELECT saved_id FROM saved_posts WHERE user_id = ? AND tour_plan_id = ? AND saved_type = 'tour_plan'",
      [userId, id]
    );

    let hasSaved = false;
    if (existing) {
      await query("DELETE FROM saved_posts WHERE saved_id = ?", [existing.saved_id]);
      await query("UPDATE tour_plans SET saves_count = GREATEST(0, saves_count - 1) WHERE tour_plan_id = ?", [id]);
      hasSaved = false;
    } else {
      const savedId = "saved_" + Date.now();
      await query(
        "INSERT INTO saved_posts (saved_id, user_id, tour_plan_id, saved_type) VALUES (?, ?, ?, 'tour_plan')",
        [savedId, userId, id]
      );
      await query("UPDATE tour_plans SET saves_count = saves_count + 1 WHERE tour_plan_id = ?", [id]);
      hasSaved = true;
    }

    const [updated] = await query("SELECT saves_count FROM tour_plans WHERE tour_plan_id = ?", [id]);

    res.json({
      success: true,
      hasSaved,
      savesCount: updated?.saves_count || 0
    });
  } catch (error) {
    console.error("Error in toggleSaveTourPlan:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/tour-plans/:id/rate
 * Rate & review a tour plan
 */
export async function rateTourPlan(req, res) {
  try {
    const { id } = req.params;
    const { user, rating, reviewText } = req.body;

    const userId = await ensureUserExists(user);
    const ratingVal = Math.min(5, Math.max(1, Number(rating) || 5));
    const ratingId = "trate_" + Date.now();

    await query(`
      INSERT INTO tour_ratings (rating_id, tour_plan_id, user_id, overall_rating, review_text)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        overall_rating = VALUES(overall_rating),
        review_text = VALUES(review_text)
    `, [ratingId, id, userId, ratingVal, reviewText || ""]);

    // Recalculate average rating
    const [stats] = await query(
      "SELECT AVG(overall_rating) as avgRating, COUNT(*) as totalRatings FROM tour_ratings WHERE tour_plan_id = ?",
      [id]
    );

    const avgRating = Number(stats?.avgRating || ratingVal).toFixed(2);
    const totalRatings = stats?.totalRatings || 1;

    await query(
      "UPDATE tour_plans SET rating_avg = ?, rating_count = ? WHERE tour_plan_id = ?",
      [avgRating, totalRatings, id]
    );

    res.json({
      success: true,
      message: "Rating submitted successfully!",
      ratingAvg: Number(avgRating),
      ratingCount: totalRatings
    });
  } catch (error) {
    console.error("Error in rateTourPlan:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/tour-plans/:id/comment
 * Add comment to a tour plan
 */
export async function addTourPlanComment(req, res) {
  try {
    const { id } = req.params;
    const { user, commentText } = req.body;

    if (!commentText || !commentText.trim()) {
      return res.status(400).json({ success: false, message: "Comment text cannot be empty." });
    }

    const userId = await ensureUserExists(user);
    const commentId = "c_" + Date.now();

    await query(`
      INSERT INTO post_comments (comment_id, post_id, user_id, comment_text, commented_type)
      VALUES (?, ?, ?, ?, 'tour_plan')
    `, [commentId, id, userId, commentText.trim()]);

    await query("UPDATE tour_plans SET comments_count = comments_count + 1 WHERE tour_plan_id = ?", [id]);

    const newComment = {
      id: commentId,
      user: user?.name || user?.username || "Traveler",
      avatar: user?.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user?.username || 'traveler'}`,
      text: commentText.trim(),
      time: "Just now"
    };

    res.status(201).json({ success: true, comment: newComment });
  } catch (error) {
    console.error("Error in addTourPlanComment:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export default {
  getAllTourPlans,
  getTourPlanById,
  createTourPlan,
  updateTourPlan,
  deleteTourPlan,
  startTourPlan,
  endTourPlan,
  checkInStop,
  skipStop,
  addSpontaneousStop,
  addTourExpense,
  deleteTourExpense,
  toggleLikeTourPlan,
  toggleSaveTourPlan,
  rateTourPlan,
  addTourPlanComment
};
