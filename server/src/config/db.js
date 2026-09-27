import mysql from "mysql2/promise";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "lagatour_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool = null;

export async function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

export async function query(sql, params = []) {
  const p = await getPool();
  const [results] = await p.query(sql, params);
  return results;
}


/**
 * Initializes the MySQL database and creates tables from lagatour_db.sql schema if missing.
 * Also seeds initial users and posts so the feed is populated immediately.
 */
export async function initDatabase() {
  try {
    // 1. Establish initial connection to MySQL server without database specified
    const initialConn = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password
    });

    await initialConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await initialConn.end();

    const p = await getPool();

    // 2. Create Users table (with password_hash)
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`user_id\` varchar(255) NOT NULL,
        \`email\` varchar(255) NOT NULL,
        \`password_hash\` varchar(255) DEFAULT NULL,
        \`username\` varchar(100) NOT NULL,
        \`first_name\` varchar(100) DEFAULT NULL,
        \`last_name\` varchar(100) DEFAULT NULL,
        \`profile_picture_url\` LONGTEXT DEFAULT NULL,
        \`bio\` text DEFAULT NULL,
        \`country\` varchar(100) DEFAULT NULL,
        \`city\` varchar(100) DEFAULT NULL,
        \`phone\` varchar(20) DEFAULT NULL,
        \`preferred_travel_type\` enum('Solo','Friends','Family','Couple','Group') DEFAULT NULL,
        \`total_trips_shared\` int(11) DEFAULT 0,
        \`league_points\` int(11) DEFAULT 0,
        \`followers_count\` int(11) DEFAULT 0,
        \`following_count\` int(11) DEFAULT 0,
        \`is_verified\` tinyint(1) DEFAULT 0,
        \`account_status\` enum('active','suspended','deleted') DEFAULT 'active',
        \`created_at\` datetime DEFAULT current_timestamp(),
        \`updated_at\` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        \`last_login\` datetime DEFAULT NULL,
        PRIMARY KEY (\`user_id\`),
        UNIQUE KEY \`email\` (\`email\`),
        UNIQUE KEY \`username\` (\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure profile_picture_url and media_url support large base64 images
    try {
      await p.query("ALTER TABLE `users` MODIFY `profile_picture_url` LONGTEXT NULL;");
      await p.query("ALTER TABLE `post_media` MODIFY `media_url` LONGTEXT NULL;");
      await p.query("ALTER TABLE `reports` MODIFY `user_id` VARCHAR(255) NULL;");
    } catch (colErr) {
      // Ignored if already longtext or null
    }

    // Ensure password_hash column exists if table existed previously without it
    const [pwdCol] = await p.query("SHOW COLUMNS FROM users LIKE 'password_hash'");
    if (pwdCol.length === 0) {
      await p.query("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email");
    }

    // Ensure role column exists for administrative authorization
    const [roleCol] = await p.query("SHOW COLUMNS FROM users LIKE 'role'");
    if (roleCol.length === 0) {
      await p.query("ALTER TABLE users ADD COLUMN role ENUM('user', 'moderator', 'admin', 'superadmin') DEFAULT 'user' AFTER email");
    }

    // 3. Create Email Verifications table for OTP codes
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`email_verifications\` (
        \`verification_id\` varchar(255) NOT NULL,
        \`email\` varchar(255) NOT NULL,
        \`code\` varchar(10) NOT NULL,
        \`purpose\` enum('signup','forgot_password') NOT NULL DEFAULT 'signup',
        \`expires_at\` datetime NOT NULL,
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`verification_id\`),
        KEY \`idx_email_code\` (\`email\`, \`code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Create Posts table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`posts\` (
        \`post_id\` varchar(255) NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`caption\` text DEFAULT NULL,
        \`likes_count\` int(11) DEFAULT 0,
        \`comments_count\` int(11) DEFAULT 0,
        \`shares_count\` int(11) DEFAULT 0,
        \`saves_count\` int(11) DEFAULT 0,
        \`is_public\` tinyint(1) DEFAULT 1,
        \`created_at\` datetime DEFAULT current_timestamp(),
        \`updated_at\` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (\`post_id\`),
        KEY \`fk_post_user\` (\`user_id\`),
        CONSTRAINT \`fk_post_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Create Post Media table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`post_media\` (
        \`media_id\` varchar(255) NOT NULL,
        \`post_id\` varchar(255) NOT NULL,
        \`media_url\` LONGTEXT NOT NULL,
        \`media_type\` enum('photo','video','text') DEFAULT 'photo',
        \`ai_verification_status\` enum('pending','approved','rejected','flagged') DEFAULT 'approved',
        \`ai_verified_at\` datetime DEFAULT NULL,
        \`verified_by_admin\` varchar(255) DEFAULT NULL,
        \`admin_review_notes\` text DEFAULT NULL,
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`media_id\`),
        KEY \`fk_media_post\` (\`post_id\`),
        CONSTRAINT \`fk_media_post\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\` (\`post_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Create Post Comments table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`post_comments\` (
        \`comment_id\` varchar(255) NOT NULL,
        \`post_id\` varchar(255) DEFAULT NULL,
        \`place_id\` varchar(255) DEFAULT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`comment_text\` text NOT NULL,
        \`parent_comment_id\` varchar(255) DEFAULT NULL,
        \`commented_type\` varchar(50) NOT NULL DEFAULT 'post',
        \`is_edited\` tinyint(1) DEFAULT 0,
        \`created_at\` datetime DEFAULT current_timestamp(),
        \`updated_at\` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (\`comment_id\`),
        KEY \`fk_comment_post\` (\`post_id\`),
        KEY \`fk_comment_user\` (\`user_id\`),
        CONSTRAINT \`fk_comment_post\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\` (\`post_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_comment_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Create Post Likes table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`post_likes\` (
        \`like_id\` varchar(255) NOT NULL,
        \`post_id\` varchar(255) DEFAULT NULL,
        \`tour_plan_id\` varchar(255) DEFAULT NULL,
        \`place_id\` varchar(255) DEFAULT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`liked_type\` varchar(50) NOT NULL DEFAULT 'post',
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`like_id\`),
        KEY \`fk_like_post\` (\`post_id\`),
        KEY \`fk_like_user\` (\`user_id\`),
        CONSTRAINT \`fk_like_post\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\` (\`post_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_like_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 8. Create Saved Posts table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`saved_posts\` (
        \`saved_id\` varchar(255) NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`post_id\` varchar(255) DEFAULT NULL,
        \`tour_plan_id\` varchar(255) DEFAULT NULL,
        \`place_id\` varchar(255) DEFAULT NULL,
        \`saved_type\` varchar(50) NOT NULL DEFAULT 'post',
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`saved_id\`),
        KEY \`fk_saved_user\` (\`user_id\`),
        KEY \`fk_saved_post\` (\`post_id\`),
        CONSTRAINT \`fk_saved_post\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\` (\`post_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_saved_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 9. Create Reports table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`reports\` (
        \`report_id\` varchar(255) NOT NULL,
        \`post_id\` varchar(255) DEFAULT NULL,
        \`place_id\` varchar(255) DEFAULT NULL,
        \`reported_user_id\` varchar(255) DEFAULT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`report_type\` varchar(50) NOT NULL DEFAULT 'post',
        \`report_description\` text NOT NULL,
        \`status\` enum('pending','reviewed','dismissed','action_taken') DEFAULT 'pending',
        \`action_taken\` varchar(255) DEFAULT NULL,
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`report_id\`),
        KEY \`fk_report_user\` (\`user_id\`),
        CONSTRAINT \`fk_report_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 9b. Create System Announcements table (for Admin Broadcasts)
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`system_announcements\` (
        \`announcement_id\` varchar(255) NOT NULL,
        \`title\` varchar(255) DEFAULT NULL,
        \`message\` text NOT NULL,
        \`priority\` enum('info','warning','error','success') DEFAULT 'info',
        \`is_banner\` tinyint(1) DEFAULT 0,
        \`is_active\` tinyint(1) DEFAULT 1,
        \`created_by\` varchar(255) DEFAULT NULL,
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`announcement_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10. Table structure for conversations (Direct & Group Chats)
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`conversations\` (
        \`conversation_id\` VARCHAR(255) NOT NULL,
        \`type\` ENUM('direct', 'group') NOT NULL DEFAULT 'direct',
        \`title\` VARCHAR(255) DEFAULT NULL COMMENT 'Group chat name, NULL for 1-on-1 direct chat',
        \`avatar_url\` LONGTEXT DEFAULT NULL COMMENT 'Custom group avatar or photo',
        \`created_by\` VARCHAR(255) DEFAULT NULL COMMENT 'Creator user_id for group chats',
        \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`conversation_id\`),
        KEY \`fk_conv_creator\` (\`created_by\`),
        CONSTRAINT \`fk_conv_creator\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 11. Table structure for conversation_members (Participants & Unread Tracking)
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`conversation_members\` (
        \`member_id\` VARCHAR(255) NOT NULL,
        \`conversation_id\` VARCHAR(255) NOT NULL,
        \`user_id\` VARCHAR(255) NOT NULL,
        \`role\` ENUM('admin', 'member') NOT NULL DEFAULT 'member',
        \`joined_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
        \`last_read_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`member_id\`),
        UNIQUE KEY \`unique_conversation_user\` (\`conversation_id\`, \`user_id\`),
        KEY \`fk_member_conv\` (\`conversation_id\`),
        KEY \`fk_member_user\` (\`user_id\`),
        CONSTRAINT \`fk_member_conv\` FOREIGN KEY (\`conversation_id\`) REFERENCES \`conversations\` (\`conversation_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_member_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 12. Table structure for messages (Message Stream & Media)
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`messages\` (
        \`message_id\` VARCHAR(255) NOT NULL,
        \`conversation_id\` VARCHAR(255) NOT NULL,
        \`sender_id\` VARCHAR(255) NOT NULL,
        \`message_text\` TEXT NOT NULL,
        \`media_url\` LONGTEXT DEFAULT NULL,
        \`message_type\` ENUM('text', 'image', 'video', 'system') NOT NULL DEFAULT 'text',
        \`is_read\` TINYINT(1) DEFAULT 0,
        \`is_deleted\` TINYINT(1) DEFAULT 0,
        \`is_edited\` TINYINT(1) DEFAULT 0,
        \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`message_id\`),
        KEY \`fk_msg_conv\` (\`conversation_id\`),
        KEY \`fk_msg_sender\` (\`sender_id\`),
        KEY \`idx_conv_created\` (\`conversation_id\`, \`created_at\`),
        CONSTRAINT \`fk_msg_conv\` FOREIGN KEY (\`conversation_id\`) REFERENCES \`conversations\` (\`conversation_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_msg_sender\` FOREIGN KEY (\`sender_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure is_deleted, is_edited exist and message_text is NULLABLE for pure image attachments
    try {
      await p.query(`ALTER TABLE \`messages\` MODIFY COLUMN \`message_text\` TEXT NULL;`);
    } catch (colErr) {
      // Ignore
    }
    try {
      await p.query(`ALTER TABLE \`messages\` ADD COLUMN \`is_deleted\` TINYINT(1) DEFAULT 0;`);
    } catch (colErr) {
      // Column already exists - ignore
    }
    try {
      await p.query(`ALTER TABLE \`messages\` ADD COLUMN \`is_edited\` TINYINT(1) DEFAULT 0;`);
    } catch (colErr) {
      // Column already exists - ignore
    }
    try {
      await p.query(`ALTER TABLE \`conversations\` MODIFY \`type\` VARCHAR(50) NOT NULL DEFAULT 'direct';`);
    } catch (colErr) {
      // ignore
    }

    // 12b. Table structure for admin_support_chats
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`admin_support_chats\` (
        \`request_id\` VARCHAR(255) NOT NULL,
        \`user_id\` VARCHAR(255) NOT NULL,
        \`conversation_id\` VARCHAR(255) NOT NULL,
        \`status\` ENUM('pending', 'accepted', 'resolved') NOT NULL DEFAULT 'pending',
        \`accepted_by\` VARCHAR(255) DEFAULT NULL,
        \`accepted_by_name\` VARCHAR(255) DEFAULT NULL,
        \`accepted_at\` DATETIME DEFAULT NULL,
        \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`request_id\`),
        UNIQUE KEY \`unique_support_conv\` (\`conversation_id\`),
        KEY \`fk_support_user\` (\`user_id\`),
        CONSTRAINT \`fk_support_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_support_conv\` FOREIGN KEY (\`conversation_id\`) REFERENCES \`conversations\` (\`conversation_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 13. Create Divisions table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`divisions\` (
        \`division_id\` varchar(50) NOT NULL,
        \`division_name\` varchar(100) NOT NULL,
        PRIMARY KEY (\`division_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 14. Create Districts table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`districts\` (
        \`district_id\` varchar(50) NOT NULL,
        \`district_name\` varchar(100) NOT NULL,
        \`division_id\` varchar(50) NOT NULL,
        PRIMARY KEY (\`district_id\`),
        KEY \`fk_district_division\` (\`division_id\`),
        CONSTRAINT \`fk_district_division\` FOREIGN KEY (\`division_id\`) REFERENCES \`divisions\` (\`division_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 15. Create Places table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`places\` (
        \`place_id\` varchar(255) NOT NULL,
        \`place_name\` varchar(255) NOT NULL,
        \`description\` text DEFAULT NULL,
        \`division_id\` varchar(50) DEFAULT NULL,
        \`district_id\` varchar(50) DEFAULT NULL,
        \`division\` varchar(100) DEFAULT NULL,
        \`district\` varchar(100) DEFAULT NULL,
        \`latitude\` decimal(10,8) NOT NULL,
        \`longitude\` decimal(11,8) NOT NULL,
        \`address\` varchar(500) DEFAULT NULL,
        \`safety_rating\` decimal(3,2) DEFAULT 5.00,
        \`safety_rating_count\` int(11) DEFAULT 0,
        \`is_public\` tinyint(1) DEFAULT 0,
        \`created_by\` varchar(255) DEFAULT NULL,
        \`likes_count\` int(11) DEFAULT 0,
        \`comments_count\` int(11) DEFAULT 0,
        \`shares_count\` int(11) DEFAULT 0,
        \`saves_count\` int(11) DEFAULT 0,
        \`created_at\` datetime DEFAULT current_timestamp(),
        \`updated_at\` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (\`place_id\`),
        KEY \`fk_place_user\` (\`created_by\`),
        CONSTRAINT \`fk_place_user\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure missing columns exist in places table if created previously
    try {
      const [placeCols] = await p.query("SHOW COLUMNS FROM places");
      const colNames = placeCols.map(c => c.Field);
      if (!colNames.includes("division_id")) await p.query("ALTER TABLE places ADD COLUMN division_id varchar(50) NULL");
      if (!colNames.includes("district_id")) await p.query("ALTER TABLE places ADD COLUMN district_id varchar(50) NULL");
      if (!colNames.includes("safety_rating")) await p.query("ALTER TABLE places ADD COLUMN safety_rating decimal(3,2) DEFAULT 5.00");
      if (!colNames.includes("safety_rating_count")) await p.query("ALTER TABLE places ADD COLUMN safety_rating_count int(11) DEFAULT 0");
      if (!colNames.includes("is_public")) await p.query("ALTER TABLE places ADD COLUMN is_public tinyint(1) DEFAULT 0");
      if (!colNames.includes("created_by")) await p.query("ALTER TABLE places ADD COLUMN created_by varchar(255) DEFAULT NULL");
      if (!colNames.includes("likes_count")) await p.query("ALTER TABLE places ADD COLUMN likes_count int(11) DEFAULT 0");
      if (!colNames.includes("comments_count")) await p.query("ALTER TABLE places ADD COLUMN comments_count int(11) DEFAULT 0");
      if (!colNames.includes("shares_count")) await p.query("ALTER TABLE places ADD COLUMN shares_count int(11) DEFAULT 0");
      if (!colNames.includes("saves_count")) await p.query("ALTER TABLE places ADD COLUMN saves_count int(11) DEFAULT 0");
    } catch (alterErr) {
      console.warn("Places table check warning:", alterErr.message);
    }

    // Ensure place_id column in post_likes, post_comments, saved_posts, reports
    try {
      await p.query("ALTER TABLE `post_likes` MODIFY `liked_type` varchar(50) NOT NULL DEFAULT 'post';");
      await p.query("ALTER TABLE `post_comments` MODIFY `commented_type` varchar(50) NOT NULL DEFAULT 'post';");
      await p.query("ALTER TABLE `saved_posts` MODIFY `saved_type` varchar(50) NOT NULL DEFAULT 'post';");
      
      const [likeCols] = await p.query("SHOW COLUMNS FROM post_likes LIKE 'place_id'");
      if (likeCols.length === 0) await p.query("ALTER TABLE post_likes ADD COLUMN place_id varchar(255) NULL");

      const [commCols] = await p.query("SHOW COLUMNS FROM post_comments LIKE 'place_id'");
      if (commCols.length === 0) await p.query("ALTER TABLE post_comments ADD COLUMN place_id varchar(255) NULL");

      const [saveCols] = await p.query("SHOW COLUMNS FROM saved_posts LIKE 'place_id'");
      if (saveCols.length === 0) await p.query("ALTER TABLE saved_posts ADD COLUMN place_id varchar(255) NULL");

      const [repCols] = await p.query("SHOW COLUMNS FROM reports LIKE 'place_id'");
      if (repCols.length === 0) await p.query("ALTER TABLE reports ADD COLUMN place_id varchar(255) NULL");
      
      const [repTypeCols] = await p.query("SHOW COLUMNS FROM reports LIKE 'report_type'");
      if (repTypeCols.length === 0) await p.query("ALTER TABLE reports ADD COLUMN report_type varchar(50) DEFAULT 'post'");

      const [repUserCols] = await p.query("SHOW COLUMNS FROM reports LIKE 'reported_user_id'");
      if (repUserCols.length === 0) await p.query("ALTER TABLE reports ADD COLUMN reported_user_id varchar(255) NULL AFTER user_id");

      const [repStatusCols] = await p.query("SHOW COLUMNS FROM reports LIKE 'status'");
      if (repStatusCols.length === 0) await p.query("ALTER TABLE reports ADD COLUMN status enum('pending','reviewed','dismissed','action_taken') DEFAULT 'pending'");

      const [repActionCols] = await p.query("SHOW COLUMNS FROM reports LIKE 'action_taken'");
      if (repActionCols.length === 0) await p.query("ALTER TABLE reports ADD COLUMN action_taken varchar(255) NULL");
    } catch (e) {
      // safe fallback
    }

    // 16. Create Place Images table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`place_images\` (
        \`img_id\` varchar(255) NOT NULL,
        \`place_id\` varchar(255) NOT NULL,
        \`image_url\` LONGTEXT NOT NULL,
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`img_id\`),
        KEY \`fk_img_place\` (\`place_id\`),
        CONSTRAINT \`fk_img_place\` FOREIGN KEY (\`place_id\`) REFERENCES \`places\` (\`place_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 17. Create MyPlaces table (User's personal recorded places collection)
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`myplaces\` (
        \`my_place_id\` varchar(255) NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`place_id\` varchar(255) NOT NULL,
        \`is_owner\` tinyint(1) DEFAULT 1,
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`my_place_id\`),
        UNIQUE KEY \`unique_user_place\` (\`user_id\`, \`place_id\`),
        KEY \`fk_myplace_user\` (\`user_id\`),
        KEY \`fk_myplace_place\` (\`place_id\`),
        CONSTRAINT \`fk_myplace_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_myplace_place\` FOREIGN KEY (\`place_id\`) REFERENCES \`places\` (\`place_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 18. Create Place Ratings table (Community Safety Ratings)
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`place_ratings\` (
        \`rating_id\` varchar(255) NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`place_id\` varchar(255) NOT NULL,
        \`place_rating\` decimal(3,2) NOT NULL DEFAULT 5.00,
        \`review_text\` text DEFAULT NULL,
        \`created_at\` datetime DEFAULT current_timestamp(),
        \`updated_at\` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (\`rating_id\`),
        UNIQUE KEY \`unique_user_place_rating\` (\`user_id\`, \`place_id\`),
        KEY \`fk_rating_user_idx\` (\`user_id\`),
        KEY \`fk_rating_place_idx\` (\`place_id\`),
        CONSTRAINT \`fk_pr_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_pr_place\` FOREIGN KEY (\`place_id\`) REFERENCES \`places\` (\`place_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 19. Create Tour Plans table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`tour_plans\` (
        \`tour_plan_id\` varchar(255) NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`description\` text DEFAULT NULL,
        \`destination\` varchar(255) NOT NULL,
        \`starting_location\` varchar(255) NOT NULL,
        \`travel_start_date\` date DEFAULT NULL,
        \`travel_end_date\` date DEFAULT NULL,
        \`duration_days\` int(11) DEFAULT NULL,
        \`transportation\` enum('Flight','Train','Bus','Car','Bike','Walk','Multiple') NOT NULL DEFAULT 'Bus',
        \`accommodation_type\` enum('Hotel','Hostel','Airbnb','Home_Stay','Camping','Other') DEFAULT 'Hotel',
        \`accommodation_details\` text DEFAULT NULL,
        \`total_budget\` decimal(12,2) DEFAULT NULL,
        \`travel_tips\` text DEFAULT NULL,
        \`travel_type\` enum('Solo','Friends','Family','Couple','Group') DEFAULT 'Friends',
        \`season\` enum('Spring','Summer','Fall','Winter') DEFAULT 'Winter',
        \`is_public\` tinyint(1) DEFAULT 1,
        \`views_count\` int(11) DEFAULT 0,
        \`likes_count\` int(11) DEFAULT 0,
        \`comments_count\` int(11) DEFAULT 0,
        \`rating_avg\` decimal(3,2) DEFAULT 0.00,
        \`rating_count\` int(11) DEFAULT 0,
        \`saves_count\` int(11) DEFAULT 0,
        \`created_at\` datetime DEFAULT current_timestamp(),
        \`updated_at\` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (\`tour_plan_id\`),
        KEY \`fk_tour_plan_user\` (\`user_id\`),
        CONSTRAINT \`fk_tour_plan_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure missing columns exist in tour_plans table if created previously
    try {
      const [tpCols] = await p.query("SHOW COLUMNS FROM tour_plans");
      const colNames = tpCols.map(c => c.Field);
      if (!colNames.includes("status")) await p.query("ALTER TABLE tour_plans ADD COLUMN status varchar(50) DEFAULT 'planned'");
      if (!colNames.includes("spent_budget")) await p.query("ALTER TABLE tour_plans ADD COLUMN spent_budget decimal(12,2) DEFAULT 0.00");
      if (!colNames.includes("cover_image")) await p.query("ALTER TABLE tour_plans ADD COLUMN cover_image LONGTEXT NULL");
      if (!colNames.includes("social_post_id")) await p.query("ALTER TABLE tour_plans ADD COLUMN social_post_id varchar(255) NULL");
      if (!colNames.includes("actual_started_at")) await p.query("ALTER TABLE tour_plans ADD COLUMN actual_started_at datetime NULL");
      if (!colNames.includes("actual_ended_at")) await p.query("ALTER TABLE tour_plans ADD COLUMN actual_ended_at datetime NULL");
      if (!colNames.includes("saves_count")) await p.query("ALTER TABLE tour_plans ADD COLUMN saves_count int(11) DEFAULT 0");
      if (!colNames.includes("views_count")) await p.query("ALTER TABLE tour_plans ADD COLUMN views_count int(11) DEFAULT 0");
      if (!colNames.includes("likes_count")) await p.query("ALTER TABLE tour_plans ADD COLUMN likes_count int(11) DEFAULT 0");
      if (!colNames.includes("comments_count")) await p.query("ALTER TABLE tour_plans ADD COLUMN comments_count int(11) DEFAULT 0");
      if (!colNames.includes("rating_avg")) await p.query("ALTER TABLE tour_plans ADD COLUMN rating_avg decimal(3,2) DEFAULT 0.00");
      if (!colNames.includes("rating_count")) await p.query("ALTER TABLE tour_plans ADD COLUMN rating_count int(11) DEFAULT 0");
    } catch (tpAlterErr) {
      // safe fallback
    }

    // 20. Create Tour Plan Places Modified table (Spots & Itinerary Stops)
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`tour_plan_places_modified\` (
        \`tour_plan_place_id\` varchar(255) NOT NULL,
        \`tour_plan_id\` varchar(255) NOT NULL,
        \`place_id\` varchar(255) DEFAULT NULL,
        \`place_name\` varchar(255) DEFAULT NULL,
        \`location\` varchar(250) DEFAULT NULL,
        \`stop_order\` int(11) DEFAULT 1,
        \`latitude\` decimal(10,8) DEFAULT NULL,
        \`longitude\` decimal(11,8) DEFAULT NULL,
        \`visit_date\` date DEFAULT NULL,
        \`notes\` text DEFAULT NULL,
        \`transport_mode\` varchar(100) DEFAULT NULL,
        \`transport_details\` text DEFAULT NULL,
        \`transport_cost\` decimal(10,2) DEFAULT 0.00,
        \`has_accommodation\` tinyint(1) DEFAULT 0,
        \`accommodation_type\` varchar(100) DEFAULT NULL,
        \`accommodation_name\` varchar(255) DEFAULT NULL,
        \`accommodation_cost\` decimal(10,2) DEFAULT 0.00,
        \`accommodation_details\` text DEFAULT NULL,
        \`stay_duration\` varchar(100) DEFAULT NULL,
        \`status\` varchar(50) DEFAULT 'pending',
        \`is_spontaneous\` tinyint(1) DEFAULT 0,
        \`discovery_badge\` varchar(100) DEFAULT NULL,
        \`check_in_time\` datetime DEFAULT NULL,
        \`check_in_lat\` decimal(10,8) DEFAULT NULL,
        \`check_in_lng\` decimal(11,8) DEFAULT NULL,
        \`check_in_note\` text DEFAULT NULL,
        \`photos\` LONGTEXT DEFAULT NULL,
        \`Expense\` double DEFAULT 0.00,
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`tour_plan_place_id\`),
        KEY \`fk_tpp_tour_plan\` (\`tour_plan_id\`),
        KEY \`fk_tpp_place\` (\`place_id\`),
        CONSTRAINT \`fk_tpp_tour_plan\` FOREIGN KEY (\`tour_plan_id\`) REFERENCES \`tour_plans\` (\`tour_plan_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure all columns exist in tour_plan_places_modified if it already existed
    try {
      const [tppCols] = await p.query("SHOW COLUMNS FROM tour_plan_places_modified");
      const colNames = tppCols.map(c => c.Field);
      if (!colNames.includes("place_name")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN place_name varchar(255) NULL");
      if (!colNames.includes("stop_order")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN stop_order int(11) DEFAULT 1");
      if (!colNames.includes("latitude")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN latitude decimal(10,8) NULL");
      if (!colNames.includes("longitude")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN longitude decimal(11,8) NULL");
      if (!colNames.includes("transport_mode")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN transport_mode varchar(100) NULL");
      if (!colNames.includes("transport_details")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN transport_details text NULL");
      if (!colNames.includes("transport_cost")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN transport_cost decimal(10,2) DEFAULT 0.00");
      if (!colNames.includes("has_accommodation")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN has_accommodation tinyint(1) DEFAULT 0");
      if (!colNames.includes("accommodation_name")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN accommodation_name varchar(255) NULL");
      if (!colNames.includes("accommodation_cost")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN accommodation_cost decimal(10,2) DEFAULT 0.00");
      if (!colNames.includes("stay_duration")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN stay_duration varchar(100) NULL");
      if (!colNames.includes("status")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN status varchar(50) DEFAULT 'pending'");
      if (!colNames.includes("is_spontaneous")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN is_spontaneous tinyint(1) DEFAULT 0");
      if (!colNames.includes("discovery_badge")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN discovery_badge varchar(100) NULL");
      if (!colNames.includes("check_in_time")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN check_in_time datetime NULL");
      if (!colNames.includes("check_in_lat")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN check_in_lat decimal(10,8) NULL");
      if (!colNames.includes("check_in_lng")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN check_in_lng decimal(11,8) NULL");
      if (!colNames.includes("check_in_note")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN check_in_note text NULL");
      if (!colNames.includes("photos")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN photos LONGTEXT NULL");
      if (!colNames.includes("Expense") && !colNames.includes("expense")) await p.query("ALTER TABLE tour_plan_places_modified ADD COLUMN Expense double DEFAULT 0.00");

      try {
        await p.query("ALTER TABLE tour_plan_places_modified MODIFY COLUMN place_id varchar(255) NULL");
        await p.query("ALTER TABLE tour_plan_places_modified DROP FOREIGN KEY fk_tpp_place");
      } catch (e) {}
    } catch (tppAlterErr) {
      // safe fallback
    }

    // 21. Create Tour Plan Members table (Companions & Groups)
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`tour_plan_members\` (
        \`id\` varchar(255) NOT NULL,
        \`tour_plan_id\` varchar(255) NOT NULL,
        \`user_id\` varchar(255) DEFAULT NULL,
        \`name\` varchar(150) NOT NULL,
        \`username\` varchar(100) DEFAULT NULL,
        \`avatar\` LONGTEXT DEFAULT NULL,
        \`phone\` varchar(30) DEFAULT NULL,
        \`role\` varchar(100) DEFAULT 'Member',
        \`invite_status\` enum('accepted','pending','declined') DEFAULT 'accepted',
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`id\`),
        KEY \`fk_tpm_tour_plan\` (\`tour_plan_id\`),
        CONSTRAINT \`fk_tpm_tour_plan\` FOREIGN KEY (\`tour_plan_id\`) REFERENCES \`tour_plans\` (\`tour_plan_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 22. Create Tour Plan Expenses table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`tour_plan_expenses\` (
        \`expense_id\` varchar(255) NOT NULL,
        \`tour_plan_id\` varchar(255) NOT NULL,
        \`stop_id\` varchar(255) DEFAULT NULL,
        \`category\` varchar(100) DEFAULT 'General',
        \`amount\` decimal(10,2) NOT NULL DEFAULT 0.00,
        \`note\` text DEFAULT NULL,
        \`timestamp\` varchar(50) DEFAULT NULL,
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`expense_id\`),
        KEY \`fk_tpe_tour_plan\` (\`tour_plan_id\`),
        CONSTRAINT \`fk_tpe_tour_plan\` FOREIGN KEY (\`tour_plan_id\`) REFERENCES \`tour_plans\` (\`tour_plan_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 23. Create Tour Ratings table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`tour_ratings\` (
        \`rating_id\` varchar(255) NOT NULL,
        \`tour_plan_id\` varchar(255) NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`overall_rating\` decimal(2,1) NOT NULL,
        \`review_text\` text DEFAULT NULL,
        \`created_at\` datetime DEFAULT current_timestamp(),
        \`updated_at\` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (\`rating_id\`),
        UNIQUE KEY \`unique_user_tour_rating\` (\`tour_plan_id\`,\`user_id\`),
        KEY \`fk_rating_user\` (\`user_id\`),
        CONSTRAINT \`fk_rating_tour\` FOREIGN KEY (\`tour_plan_id\`) REFERENCES \`tour_plans\` (\`tour_plan_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_rating_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 24. Create Follows table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`follows\` (
        \`follow_id\` varchar(255) NOT NULL,
        \`follower_id\` varchar(255) NOT NULL,
        \`following_id\` varchar(255) NOT NULL,
        \`status\` enum('pending','accepted','blocked') DEFAULT 'pending',
        \`requested_at\` datetime DEFAULT current_timestamp(),
        \`accepted_at\` datetime DEFAULT NULL,
        \`updated_at\` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (\`follow_id\`),
        UNIQUE KEY \`unique_follow\` (\`follower_id\`,\`following_id\`),
        KEY \`fk_follow_following\` (\`following_id\`),
        CONSTRAINT \`fk_follow_follower\` FOREIGN KEY (\`follower_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_follow_following\` FOREIGN KEY (\`following_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 23. Create Expedition Groups table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`expedition_groups\` (
        \`group_id\` varchar(255) NOT NULL,
        \`organizer_id\` varchar(255) NOT NULL,
        \`conversation_id\` varchar(255) DEFAULT NULL,
        \`title\` varchar(255) NOT NULL,
        \`destination\` varchar(255) NOT NULL,
        \`travel_date\` date DEFAULT NULL,
        \`estimated_budget\` decimal(12,2) DEFAULT NULL,
        \`max_members\` int(11) DEFAULT 10,
        \`transportation\` varchar(100) DEFAULT 'Bus',
        \`accommodation_plan\` text DEFAULT NULL,
        \`itinerary\` text DEFAULT NULL,
        \`status\` enum('planning','open','full','completed','cancelled') DEFAULT 'open',
        \`created_at\` datetime DEFAULT current_timestamp(),
        \`updated_at\` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (\`group_id\`),
        KEY \`fk_exp_group_organizer\` (\`organizer_id\`),
        CONSTRAINT \`fk_exp_group_organizer\` FOREIGN KEY (\`organizer_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      const [egCols] = await p.query("SHOW COLUMNS FROM expedition_groups");
      const egColNames = egCols.map(c => c.Field);
      if (!egColNames.includes("conversation_id")) {
        await p.query("ALTER TABLE expedition_groups ADD COLUMN conversation_id varchar(255) NULL AFTER organizer_id");
      }
    } catch (egAlterErr) {}

    // 24. Create Expedition Members table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`expedition_members\` (
        \`id\` varchar(255) NOT NULL,
        \`group_id\` varchar(255) NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`role\` enum('organizer','member','guide') DEFAULT 'member',
        \`status\` enum('pending','accepted','rejected') DEFAULT 'pending',
        \`joined_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`unique_group_member\` (\`group_id\`, \`user_id\`),
        KEY \`fk_em_group\` (\`group_id\`),
        KEY \`fk_em_user\` (\`user_id\`),
        CONSTRAINT \`fk_em_group\` FOREIGN KEY (\`group_id\`) REFERENCES \`expedition_groups\` (\`group_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_em_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 25. Create Expedition Checklists table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`expedition_checklists\` (
        \`task_id\` varchar(255) NOT NULL,
        \`group_id\` varchar(255) NOT NULL,
        \`task\` varchar(255) NOT NULL,
        \`is_completed\` tinyint(1) DEFAULT 0,
        \`assigned_to_user_id\` varchar(255) DEFAULT NULL,
        \`assigned_to_name\` varchar(150) DEFAULT NULL,
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`task_id\`),
        KEY \`fk_ec_group\` (\`group_id\`),
        CONSTRAINT \`fk_ec_group\` FOREIGN KEY (\`group_id\`) REFERENCES \`expedition_groups\` (\`group_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 26. Create Expedition Expenses table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`expedition_expenses\` (
        \`expense_id\` varchar(255) NOT NULL,
        \`group_id\` varchar(255) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`amount\` decimal(12,2) NOT NULL DEFAULT 0.00,
        \`paid_by_user_id\` varchar(255) DEFAULT NULL,
        \`paid_by_name\` varchar(150) DEFAULT NULL,
        \`date\` varchar(50) DEFAULT NULL,
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`expense_id\`),
        KEY \`fk_ee_group\` (\`group_id\`),
        CONSTRAINT \`fk_ee_group\` FOREIGN KEY (\`group_id\`) REFERENCES \`expedition_groups\` (\`group_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 27. Create Expedition Itinerary Suggestions / Appeals table
    await p.query(`
      CREATE TABLE IF NOT EXISTS \`expedition_itinerary_suggestions\` (
        \`id\` varchar(255) NOT NULL,
        \`group_id\` varchar(255) NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`user_name\` varchar(150) DEFAULT NULL,
        \`user_avatar\` text DEFAULT NULL,
        \`day\` varchar(50) NOT NULL DEFAULT 'Day 1',
        \`activity_plan\` text NOT NULL,
        \`reason\` text DEFAULT NULL,
        \`status\` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
        \`rejection_reason\` text DEFAULT NULL,
        \`reviewed_by\` varchar(255) DEFAULT NULL,
        \`reviewed_at\` datetime DEFAULT NULL,
        \`created_at\` datetime DEFAULT current_timestamp(),
        PRIMARY KEY (\`id\`),
        KEY \`fk_eis_group\` (\`group_id\`),
        KEY \`fk_eis_user\` (\`user_id\`),
        CONSTRAINT \`fk_eis_group\` FOREIGN KEY (\`group_id\`) REFERENCES \`expedition_groups\` (\`group_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_eis_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 28. Seed default users & places & chats if empty
    await seedInitialData(p);


    console.log("✅ MySQL Database & Tables initialized successfully (lagatour_db)");
  } catch (error) {
    console.error("⚠️ Database initialization error:", error.message);
    throw error;
  }
}

async function seedInitialData(p) {
  const adminPasswordHash = await bcrypt.hash("admin", 10);

  try {
    // Guarantee admin user exists in MySQL database
    await p.query(`
      INSERT INTO users (user_id, email, password_hash, username, first_name, last_name, profile_picture_url, bio, country, city, phone, preferred_travel_type, league_points, followers_count, following_count, role)
      VALUES ('admin_root', 'admin@laga.tour', ?, 'admin_root', 'System', 'Admin', 'https://api.dicebear.com/7.x/adventurer/svg?seed=admin', 'LagaTour System Administrator', 'Bangladesh', 'Dhaka', '+8801500000000', 'Solo', 9999, 10000, 50, 'superadmin')
      ON DUPLICATE KEY UPDATE 
        password_hash = COALESCE(users.password_hash, VALUES(password_hash)),
        role = 'superadmin'
    `, [adminPasswordHash]);
  } catch (cleanErr) {
    // Non-fatal if tables are already empty
  }


  // 1. Seed Bangladesh Geographic Divisions (Reference Data)
  const divisionsData = [
    ["div_dhaka", "Dhaka"],
    ["div_chittagong", "Chattogram"],
    ["div_rajshahi", "Rajshahi"],
    ["div_khulna", "Khulna"],
    ["div_barisal", "Barishal"],
    ["div_sylhet", "Sylhet"],
    ["div_rangpur", "Rangpur"],
    ["div_mymensingh", "Mymensingh"]
  ];

  for (const [id, name] of divisionsData) {
    await p.query(
      "INSERT INTO divisions (division_id, division_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE division_name = VALUES(division_name)",
      [id, name]
    );
  }

  // 2. Seed 64 Bangladesh Districts (Reference Data)
  const districtsData = [
    // Dhaka
    ["dis_dhaka", "Dhaka", "div_dhaka"],
    ["dis_gazipur", "Gazipur", "div_dhaka"],
    ["dis_narayanganj", "Narayanganj", "div_dhaka"],
    ["dis_tangail", "Tangail", "div_dhaka"],
    ["dis_kishoreganj", "Kishoreganj", "div_dhaka"],
    ["dis_manikganj", "Manikganj", "div_dhaka"],
    ["dis_munshiganj", "Munshiganj", "div_dhaka"],
    ["dis_narsingdi", "Narsingdi", "div_dhaka"],
    ["dis_faridpur", "Faridpur", "div_dhaka"],
    ["dis_gopalganj", "Gopalganj", "div_dhaka"],
    ["dis_madaripur", "Madaripur", "div_dhaka"],
    ["dis_rajbari", "Rajbari", "div_dhaka"],
    ["dis_shariatpur", "Shariatpur", "div_dhaka"],
    // Chattogram
    ["dis_chattogram", "Chattogram", "div_chittagong"],
    ["dis_coxsbazar", "Cox's Bazar", "div_chittagong"],
    ["dis_rangamati", "Rangamati", "div_chittagong"],
    ["dis_bandarban", "Bandarban", "div_chittagong"],
    ["dis_khagrachari", "Khagrachari", "div_chittagong"],
    ["dis_cumilla", "Cumilla", "div_chittagong"],
    ["dis_feni", "Feni", "div_chittagong"],
    ["dis_brahmanbaria", "Brahmanbaria", "div_chittagong"],
    ["dis_noakhali", "Noakhali", "div_chittagong"],
    ["dis_chandpur", "Chandpur", "div_chittagong"],
    ["dis_lakshmipur", "Lakshmipur", "div_chittagong"],
    // Rajshahi
    ["dis_rajshahi", "Rajshahi", "div_rajshahi"],
    ["dis_bogura", "Bogura", "div_rajshahi"],
    ["dis_joypurhat", "Joypurhat", "div_rajshahi"],
    ["dis_naogaon", "Naogaon", "div_rajshahi"],
    ["dis_natore", "Natore", "div_rajshahi"],
    ["dis_chapainawabganj", "Chapainawabganj", "div_rajshahi"],
    ["dis_pabna", "Pabna", "div_rajshahi"],
    ["dis_sirajganj", "Sirajganj", "div_rajshahi"],
    // Khulna
    ["dis_khulna", "Khulna", "div_khulna"],
    ["dis_jashore", "Jashore", "div_khulna"],
    ["dis_satkhira", "Satkhira", "div_khulna"],
    ["dis_bagerhat", "Bagerhat", "div_khulna"],
    ["dis_kushtia", "Kushtia", "div_khulna"],
    ["dis_chuadanga", "Chuadanga", "div_khulna"],
    ["dis_meherpur", "Meherpur", "div_khulna"],
    ["dis_jhenaidah", "Jhenaidah", "div_khulna"],
    ["dis_magura", "Magura", "div_khulna"],
    ["dis_narail", "Narail", "div_khulna"],
    // Barishal
    ["dis_barishal", "Barishal", "div_barisal"],
    ["dis_patuakhali", "Patuakhali", "div_barisal"],
    ["dis_bhola", "Bhola", "div_barisal"],
    ["dis_pirojpur", "Pirojpur", "div_barisal"],
    ["dis_barguna", "Barguna", "div_barisal"],
    ["dis_jhalokati", "Jhalokati", "div_barisal"],
    // Sylhet
    ["dis_sylhet", "Sylhet", "div_sylhet"],
    ["dis_moulvibazar", "Moulvibazar", "div_sylhet"],
    ["dis_habiganj", "Habiganj", "div_sylhet"],
    ["dis_sunamganj", "Sunamganj", "div_sylhet"],
    // Rangpur
    ["dis_rangpur", "Rangpur", "div_rangpur"],
    ["dis_dinajpur", "Dinajpur", "div_rangpur"],
    ["dis_gaibandha", "Gaibandha", "div_rangpur"],
    ["dis_kurigram", "Kurigram", "div_rangpur"],
    ["dis_lalmonirhat", "Lalmonirhat", "div_rangpur"],
    ["dis_nilphamari", "Nilphamari", "div_rangpur"],
    ["dis_panchagarh", "Panchagarh", "div_rangpur"],
    ["dis_thakurgaon", "Thakurgaon", "div_rangpur"],
    // Mymensingh
    ["dis_mymensingh", "Mymensingh", "div_mymensingh"],
    ["dis_jamalpur", "Jamalpur", "div_mymensingh"],
    ["dis_netrokona", "Netrokona", "div_mymensingh"],
    ["dis_sherpur", "Sherpur", "div_mymensingh"]
  ];

  for (const [id, name, divId] of districtsData) {
    await p.query(
      "INSERT INTO districts (district_id, district_name, division_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE district_name = VALUES(district_name), division_id = VALUES(division_id)",
      [id, name, divId]
    );
  }

  // 3. Seed Community Travelers
  const samplePasswordHash = await bcrypt.hash("traveler123", 10);
  
  await p.query(`
    INSERT INTO users (user_id, email, password_hash, username, first_name, last_name, profile_picture_url, bio, country, city, preferred_travel_type, total_trips_shared, league_points, followers_count, following_count, is_verified, account_status)
    VALUES
      ('user_tariq', 'tariqul@laga.tour', ?, 'tariq_adventures', 'Tariqul', 'Islam', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400', 'Bandarban & Sajek mountaineering leader. Exploring the high peaks of Bangladesh.', 'Bangladesh', 'Bandarban', 'Group', 38, 4850, 12400, 180, 1, 'active'),
      ('user_nusrat', 'nusrat@laga.tour', ?, 'nusrat_trails', 'Nusrat', 'Jahan', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400', 'Sylhet rainforest explorer, tea garden backpacker, and wildlife photographer.', 'Bangladesh', 'Sylhet', 'Friends', 26, 3420, 8900, 240, 1, 'active'),
      ('user_siam', 'siam@laga.tour', ?, 'siam_nomad', 'Siam', 'Ahmed', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', 'Coastal tracker, scuba diver, and St. Martin Island local guide.', 'Bangladesh', 'Cox\\'s Bazar', 'Solo', 19, 2890, 7200, 310, 1, 'active'),
      ('user_tanvir', 'tanvir@laga.tour', ?, 'tanvir_heritage', 'Tanvir', 'Hossain', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400', 'Heritage and historical architecture specialist across Bagerhat & Rajshahi.', 'Bangladesh', 'Rajshahi', 'Family', 15, 1750, 4300, 150, 1, 'active'),
      ('user_farhana', 'farhana@laga.tour', ?, 'farhana_wander', 'Farhana', 'Yasmin', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', 'Mangrove researcher, houseboat traveler, and eco-tourism advocate.', 'Bangladesh', 'Khulna', 'Couple', 10, 890, 2100, 195, 0, 'active'),
      ('user_nabil', 'nabil@laga.tour', ?, 'nabil_roams', 'Nabil', 'Khan', 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400', 'Weekend camper, cycle trekker, and campfire storyteller.', 'Bangladesh', 'Dhaka', 'Friends', 7, 650, 1450, 120, 0, 'active'),
      ('user_sadia', 'sadia@laga.tour', ?, 'sadia_travels', 'Sadia', 'Rahman', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400', 'Coastal and adventure tour enthusiast. Cox\\'s Bazar rally leader.', 'Bangladesh', 'Dhaka', 'Group', 22, 3100, 5200, 210, 1, 'active'),
      ('user_rayan', 'rayan@laga.tour', ?, 'rayan_hikes', 'Rayan', 'Chowdhury', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400', 'Mountain hiker and peak trekker.', 'Bangladesh', 'Chattogram', 'Friends', 12, 1400, 3100, 140, 1, 'active')
    ON DUPLICATE KEY UPDATE league_points = VALUES(league_points), followers_count = VALUES(followers_count);
  `, [samplePasswordHash, samplePasswordHash, samplePasswordHash, samplePasswordHash, samplePasswordHash, samplePasswordHash, samplePasswordHash, samplePasswordHash]);

  // 4. Seed Verified Places & Destinations
  const [placesCount] = await p.query("SELECT COUNT(*) as count FROM places");
  if (placesCount[0].count === 0) {
    console.log("🌱 Seeding top ranked places into lagatour_db...");
    await p.query(`
      INSERT INTO places (place_id, place_name, description, division_id, district_id, division, district, latitude, longitude, address, safety_rating, safety_rating_count, is_public, created_by, likes_count, comments_count, saves_count)
      VALUES
        ('place_sajek', 'Sajek Valley (Valley of Clouds)', 'Nestled among the hills of Kasalong range in Rangamati. Famous for fluffy white clouds floating right into your resort balcony.', 'div_chittagong', 'dis_rangamati', 'Chattogram', 'Rangamati', 23.3820, 92.2938, 'Sajek Union, Baghaichhari, Rangamati', 4.95, 84, 1, 'user_tariq', 340, 45, 185),
        ('place_stmartin', 'Saint Martin\\'s Island & Chera Dwip', 'Bangladesh\\'s sole coral island surrounded by crystal-clear azure waters, coconut groves, and vibrant marine life.', 'div_chittagong', 'dis_coxsbazar', 'Chattogram', 'Cox\\'s Bazar', 20.6274, 92.3225, 'Bay of Bengal, Teknaf, Cox\\'s Bazar', 4.88, 120, 1, 'user_siam', 420, 62, 230),
        ('place_tanguar', 'Tanguar Haor Ramsar Wetland', 'Spectacular freshwater wetland ecosystem beneath the Meghalaya hills, best explored on traditional wooden houseboats.', 'div_sylhet', 'dis_sunamganj', 'Sylhet', 'Sunamganj', 25.1235, 91.0762, 'Tahirpur, Sunamganj', 4.82, 65, 1, 'user_nusrat', 280, 38, 140),
        ('place_lawachara', 'Lawachara Rainforest Sanctuary', 'Lush semi-evergreen forest famous for hoolock gibbons, canopy trees, and scenic railway tracks slicing through green hills.', 'div_sylhet', 'dis_moulvibazar', 'Sylhet', 'Moulvibazar', 24.3267, 91.7850, 'Kamalganj, Moulvibazar', 4.75, 48, 1, 'user_nusrat', 195, 22, 95),
        ('place_keokradong', 'Keokradong Peak & Boga Lake', 'One of the highest reachable mountain peaks in Bangladesh, sitting atop the mystic volcano-like Boga Lake.', 'div_chittagong', 'dis_bandarban', 'Chattogram', 'Bandarban', 21.9500, 92.5167, 'Ruma, Bandarban', 4.70, 52, 1, 'user_tariq', 260, 34, 115),
        ('place_sundarbans', 'Sundarbans Mangrove Tiger Reserve', 'The world\\'s largest contiguous mangrove forest and UNESCO World Heritage site, home to the Royal Bengal Tiger.', 'div_khulna', 'dis_bagerhat', 'Khulna', 'Bagerhat', 21.9497, 89.1833, 'Mongla, Bagerhat', 4.85, 92, 1, 'user_farhana', 310, 41, 160)
      ON DUPLICATE KEY UPDATE place_name = VALUES(place_name);
    `);

    await p.query(`
      INSERT INTO place_images (img_id, place_id, image_url)
      VALUES
        ('img_sajek', 'place_sajek', 'https://images.unsplash.com/photo-1627894483216-2138af692e32?w=800'),
        ('img_stmartin', 'place_stmartin', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800'),
        ('img_tanguar', 'place_tanguar', 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800'),
        ('img_lawachara', 'place_lawachara', 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800'),
        ('img_keokradong', 'place_keokradong', 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800'),
        ('img_sundarbans', 'place_sundarbans', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800')
      ON DUPLICATE KEY UPDATE image_url = VALUES(image_url);
    `);
  }

  // 5. Seed Top Tour Plans
  const [plansCount] = await p.query("SELECT COUNT(*) as count FROM tour_plans");
  if (plansCount[0].count === 0) {
    console.log("🌱 Seeding top ranked tour plans into lagatour_db...");
    await p.query(`
      INSERT INTO tour_plans (tour_plan_id, user_id, title, description, destination, starting_location, duration_days, transportation, accommodation_type, total_budget, travel_tips, travel_type, season, is_public, views_count, likes_count, comments_count, rating_avg, rating_count, saves_count)
      VALUES
        ('plan_sajek_3d', 'user_tariq', '3-Day Sajek Valley & Konglak Peak Cloud Walk', 'Complete itinerary covering Dighinala, Sajek Valley, Ruilui Para, and sunrise at Konglak Peak. Includes 4x4 Chander Gari transport breakdown.', 'Sajek Valley', 'Dhaka', 3, 'Car', 'Hotel', 6500.00, 'Book morning army convoy escort from Dighinala by 10 AM. Carry national ID copies.', 'Friends', 'Winter', 1, 1420, 215, 34, 4.95, 48, 142),
        ('plan_stmartin_3d', 'user_siam', '3-Day St. Martin\\'s Island & Chera Dwip Coral Escape', 'Unwind in the blue waters of Bangladesh\\'s only coral paradise. Includes ship booking tips, cycle rentals, and night BBQ near West Beach.', 'St. Martin\\'s Island', 'Chattogram', 3, 'Multiple', 'Home_Stay', 8500.00, 'Board Keari Sindbad from Teknaf jetty. Chera Dwip speed boat ride is best during low tide.', 'Group', 'Winter', 1, 1850, 310, 48, 4.90, 62, 185),
        ('plan_tanguar_2d', 'user_nusrat', '2-Day Tanguar Haor Luxury Houseboat & Niladri Lake', 'Cruise through the serene waters of Sunamganj haor, visit Shimul Bagan, Niladri blue lake quarry, and Jadukata river.', 'Tanguar Haor', 'Sylhet', 2, 'Bus', 'Home_Stay', 5500.00, 'Pre-book licensed houseboats in Tahirpur. Best experienced from July to October for high water.', 'Friends', 'Summer', 1, 980, 165, 26, 4.85, 35, 110),
        ('plan_sreemangal_2d', 'user_nusrat', '2-Day Sreemangal Tea Trails & Hum Hum Trek', 'Explore the scenic rolling tea gardens of Sreemangal, Baikka Beel bird sanctuary, Lawachara forest, and 7-layer Nilkantha tea.', 'Sreemangal', 'Dhaka', 2, 'Train', 'Hostel', 4200.00, 'Take the Parabat Express train from Dhaka Kamalapur station. Hire a CNG auto for local spots.', 'Solo', 'Spring', 1, 1200, 180, 19, 4.80, 42, 95),
        ('plan_sundarbans_4d', 'user_farhana', '4-Day Sundarbans Deep Mangrove Cruiser Expedition', 'Sail into the untamed wilderness from Mongla port to Kotka, Hiron Point, and Kochikhali canal safaris.', 'Sundarbans', 'Khulna', 4, 'Multiple', 'Home_Stay', 14500.00, 'Carry binoculars for wildlife spotting. Follow Forest Department armed guard instructions at all times.', 'Couple', 'Winter', 1, 850, 125, 18, 4.75, 28, 80)
      ON DUPLICATE KEY UPDATE title = VALUES(title);
    `);
  }

  // Seed stops for flagship tour plans if empty
  const [planStopsCount] = await p.query("SELECT COUNT(*) as count FROM tour_plan_places_modified WHERE tour_plan_id IN ('plan_sajek_3d', 'plan_sreemangal_2d', 'plan_tanguar_2d', 'plan_stmartin_3d', 'plan_sundarbans_4d')");
  if (planStopsCount[0].count < 5) {
    console.log("🌱 Seeding sequenced stops for flagship tour plans into lagatour_db...");
    await p.query(`
      INSERT INTO tour_plan_places_modified (tour_plan_place_id, tour_plan_id, place_name, location, stop_order, latitude, longitude, transport_mode, transport_details, transport_cost, has_accommodation, accommodation_name, accommodation_cost, stay_duration, notes, photos, Expense)
      VALUES
        ('stop_sajek_1', 'plan_sajek_3d', 'Dighinala Army Camp & Chander Gari Stand', 'Khagrachari to Sajek', 1, 23.25000000, 92.05000000, '4x4 Chander Gari', 'Wait for morning military convoy escort departing at 10:00 AM sharp', 1500.00, 0, '', 0.00, 'Convoy Escort', 'Military convoy checkpoint. Carry NID photocopies.', '["https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600"]', 1500.00),
        ('stop_sajek_2', 'plan_sajek_3d', 'Ruilui Para Cultural Village', 'Sajek Valley, Rangamati', 2, 23.38200000, 92.29380000, '4x4 Chander Gari', 'Scenic mountain ride through cloud canopy', 500.00, 1, 'Megh Machang Eco Cottage', 2500.00, '1 Night', 'Stroll through indigenous Lusai and Tripura village settlements.', '["https://images.unsplash.com/photo-1627894483216-2138af692e32?w=600"]', 3000.00),
        ('stop_sajek_3', 'plan_sajek_3d', 'Konglak Peak Cloud Viewpoint', 'Sajek Valley, Rangamati', 3, 23.40110000, 92.30150000, '4x4 Chander Gari', 'Early morning trek up the peak', 300.00, 0, '', 0.00, '3 Hours', 'Highest elevation point in Sajek. Breathtaking sea of clouds at sunrise.', '["https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600"]', 300.00),

        ('stop_sreemangal_1', 'plan_sreemangal_2d', 'Lawachara National Rainforest', 'Kamalganj, Sreemangal', 1, 24.32670000, 91.78500000, 'Reserved CNG', 'Scenic drive through shaded tea plantations', 400.00, 0, '', 0.00, '3 Hours', 'Semi-evergreen rainforest canopy with hoolock gibbons and paved nature trails.', '["https://images.unsplash.com/photo-1448375240586-882707db888b?w=600"]', 400.00),
        ('stop_sreemangal_2', 'plan_sreemangal_2d', 'Baikka Beel Wetland Bird Sanctuary', 'Hail Haor, Sreemangal', 2, 24.35400000, 91.68500000, 'Reserved CNG', 'Dirt track ride to wetland observation tower', 600.00, 0, '', 0.00, '2.5 Hours', 'Panoramic watch tower overlooking lotus blooms and winter migratory birds.', '["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600"]', 600.00),
        ('stop_sreemangal_3', 'plan_sreemangal_2d', 'Nilkantha 7-Layer Colored Tea Stall', 'Ramnagar, Sreemangal', 3, 24.29850000, 91.73420000, 'Electric Auto', 'Short 10-min ride from town center', 100.00, 1, 'Grand Sultan Tea Resort & Golf', 3500.00, '1 Night', 'Famous multi-layered tea created with secret spice blend and layers.', '["https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600"]', 3600.00),

        ('stop_tanguar_1', 'plan_tanguar_2d', 'Tahirpur Boat Ghat', 'Sunamganj Haor Basin', 1, 25.10500000, 91.17800000, 'Houseboat Cruise', 'Boarding luxury wooden houseboat', 2500.00, 1, 'Joltorongo Premium Haor Cruiser', 4000.00, '1 Night', 'Scenic houseboat cruise with fresh haor fish meals on board.', '["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600"]', 6500.00),
        ('stop_tanguar_2', 'plan_tanguar_2d', 'Niladri Blue Lake (Shahid Siraj Lake)', 'Tekerghat, Sunamganj', 2, 25.18500000, 91.11500000, 'Motorbike / Auto', 'Scenic lakeside trail against border hills', 300.00, 0, '', 0.00, '2 Hours', 'Mesmerizing turquoise blue water in abandoned limestone quarry.', '["https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600"]', 300.00),
        ('stop_tanguar_3', 'plan_tanguar_2d', 'Shimul Bagan Red Cotton Forest', 'Jadukata River, Sunamganj', 3, 25.11200000, 91.13400000, 'Speedboat / Auto', 'Crossing Jadukata crystal river', 400.00, 0, '', 0.00, '2 Hours', 'Vast orchard of shimul trees blooming in vivid crimson during spring.', '["https://images.unsplash.com/photo-1448375240586-882707db888b?w=600"]', 400.00),

        ('stop_stmartin_1', 'plan_stmartin_3d', 'Teknaf Ship Jetty & Naval Ghat', 'Teknaf, Cox\\'s Bazar', 1, 20.86530000, 92.29860000, 'Keari Sindbad Ship', 'Morning sea cruise departure at 9:30 AM', 1200.00, 0, '', 0.00, '2 Hours', 'Board Keari Sindbad or Bay Cruiser to Saint Martin. Carry NID copies.', '["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600"]', 1200.00),
        ('stop_stmartin_2', 'plan_stmartin_3d', 'Saint Martin\\'s West Beach & Coral View', 'St. Martin\\'s Island', 2, 20.62740000, 92.32250000, 'Cycle / Buggy', 'Scenic island cycling along coconut groves', 300.00, 1, 'Coral View Eco Resort', 2500.00, '2 Nights', 'Pristine white sand beach, fresh green coconut, and evening BBQ.', '["https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600"]', 2800.00),
        ('stop_stmartin_3', 'plan_stmartin_3d', 'Chera Dwip Coral Sanctuary', 'Chera Dwip, St. Martin', 3, 20.60150000, 92.33800000, 'Speedboat', 'Low-tide speedboat crossing over living coral beds', 500.00, 0, '', 0.00, '3 Hours', 'Southernmost tip of Bangladesh. Colorful corals and crystal clear turquoise sea.', '["https://images.unsplash.com/photo-1448375240586-882707db888b?w=600"]', 500.00),

        ('stop_sundarbans_1', 'plan_sundarbans_4d', 'Mongla Port & Forest Station', 'Mongla, Bagerhat', 1, 22.48330000, 89.60000000, 'Cruiser Ship', 'Boarding 3-tier deep mangrove exploration cruiser', 3000.00, 1, 'Sundarbans River Cruiser', 3500.00, '1 Night', 'Cruiser vessel embarkation with armed forest guards and naturalist guide.', '["https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600"]', 6500.00),
        ('stop_sundarbans_2', 'plan_sundarbans_4d', 'Karamjal Eco Tourism & Wildlife Sanctuary', 'Karamjal, Sundarbans', 2, 22.42850000, 89.59360000, 'Launch', 'Wooden boardwalk tour through dense mangrove canopy', 500.00, 0, '', 0.00, '2 Hours', 'Spot spotted deer, estuarine crocodiles, and rhesus macaques.', '["https://images.unsplash.com/photo-1448375240586-882707db888b?w=600"]', 500.00),
        ('stop_sundarbans_3', 'plan_sundarbans_4d', 'Kotka Wildlife Sanctuary & Jamtola Sea Beach', 'Kotka, Deep Sundarbans', 3, 21.85400000, 89.77500000, 'Canal Country Boat', 'Silent canal cruise for Bengal Tiger & deer spotting', 1200.00, 1, 'Tiger Trail Forest Cabin', 2500.00, '1 Night', 'Watch tower overlooking grassland deer herds and quiet ocean beach.', '["https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600"]', 3700.00),
        ('stop_sundarbans_4', 'plan_sundarbans_4d', 'Hiron Point & Nilkamal Watch Tower', 'South Sundarbans', 4, 21.78330000, 89.46670000, 'Silent Wooden Boat', 'Dawn creek rowing for birdwatching & tiger footprints', 800.00, 0, '', 0.00, '3 Hours', 'UNESCO World Heritage core zone. High probability of wildlife sighting.', '["https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600"]', 800.00)
      ON DUPLICATE KEY UPDATE place_name = VALUES(place_name);
    `);
  }

    // Seed sample conversations & messages if empty
    const [convCount] = await p.query("SELECT COUNT(*) as count FROM conversations");
    if (convCount[0].count === 0) {
      console.log("🌱 Seeding initial conversations & messages into lagatour_db...");

      await p.query(`
        INSERT INTO \`conversations\` (\`conversation_id\`, \`type\`, \`title\`, \`avatar_url\`, \`created_by\`, \`created_at\`)
        VALUES
          ('chat_1', 'direct', NULL, NULL, 'user_nabil', NOW() - INTERVAL 1 DAY),
          ('chat_2', 'direct', NULL, NULL, 'user_nusrat', NOW() - INTERVAL 2 DAY),
          ('chat_group_1', 'group', 'St. Martin\\'s Weekend Expedition 🌊', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200', 'user_nabil', NOW() - INTERVAL 3 DAY),
          ('chat_group_2', 'group', 'Sajek Valley & Konglak Peak Cloud Walk ☁️', 'https://images.unsplash.com/photo-1627894483216-2138af692e32?w=200', 'user_tariq', NOW() - INTERVAL 2 DAY),
          ('chat_group_3', 'group', 'Cox\\'s Bazar Marine Drive Rally 🏖️', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200', 'user_sadia', NOW() - INTERVAL 1 DAY)
        ON DUPLICATE KEY UPDATE \`type\` = VALUES(\`type\`);
      `);

      await p.query(`
        INSERT INTO \`conversation_members\` (\`member_id\`, \`conversation_id\`, \`user_id\`, \`role\`, \`joined_at\`)
        VALUES
          ('cm_1_1', 'chat_1', 'user_siam', 'member', NOW() - INTERVAL 1 DAY),
          ('cm_1_2', 'chat_1', 'user_nabil', 'admin', NOW() - INTERVAL 1 DAY),
          ('cm_2_1', 'chat_2', 'user_siam', 'member', NOW() - INTERVAL 2 DAY),
          ('cm_2_2', 'chat_2', 'user_nusrat', 'admin', NOW() - INTERVAL 2 DAY),
          ('cm_g1_1', 'chat_group_1', 'user_nabil', 'admin', NOW() - INTERVAL 3 DAY),
          ('cm_g1_2', 'chat_group_1', 'user_siam', 'member', NOW() - INTERVAL 3 DAY),
          ('cm_g1_3', 'chat_group_1', 'user_nusrat', 'member', NOW() - INTERVAL 3 DAY),
          ('cm_g2_1', 'chat_group_2', 'user_tariq', 'admin', NOW() - INTERVAL 2 DAY),
          ('cm_g2_2', 'chat_group_2', 'user_sadia', 'member', NOW() - INTERVAL 2 DAY),
          ('cm_g2_3', 'chat_group_2', 'user_rayan', 'member', NOW() - INTERVAL 2 DAY),
          ('cm_g3_1', 'chat_group_3', 'user_sadia', 'admin', NOW() - INTERVAL 1 DAY),
          ('cm_g3_2', 'chat_group_3', 'user_farhana', 'member', NOW() - INTERVAL 1 DAY)
        ON DUPLICATE KEY UPDATE \`role\` = VALUES(\`role\`);
      `);

      await p.query(`
        INSERT INTO \`messages\` (\`message_id\`, \`conversation_id\`, \`sender_id\`, \`message_text\`, \`message_type\`, \`created_at\`)
        VALUES
          ('msg_1_1', 'chat_1', 'user_nabil', 'Hey Siam! Are you free for the St. Martin\\'s trip in November?', 'text', NOW() - INTERVAL 60 MINUTE),
          ('msg_1_2', 'chat_1', 'user_siam', 'Yes Nabil! I just checked my calendar and joined the group. Super excited!', 'text', NOW() - INTERVAL 45 MINUTE),
          ('msg_1_3', 'chat_1', 'user_nabil', 'Great! Let\\'s update the checklist. I assigned barbecue prep to you.', 'text', NOW() - INTERVAL 30 MINUTE),
          ('msg_1_4', 'chat_1', 'user_siam', 'On it! Will look up some good options.', 'text', NOW() - INTERVAL 15 MINUTE),
          ('msg_2_1', 'chat_2', 'user_nusrat', 'Hi Siam, did you check the Sreemangal itinerary? Is Lawachara trek safe for kids?', 'text', NOW() - INTERVAL 2 HOUR),
          ('msg_2_2', 'chat_2', 'user_siam', 'Yes, it is very safe. The main trail is fully paved. Just make sure to use mosquito repellent!', 'text', NOW() - INTERVAL 90 MINUTE),
          ('msg_g1_1', 'chat_group_1', 'user_nabil', '🎉 Welcome everyone to the St. Martin\\'s Expedition group!', 'system', NOW() - INTERVAL 3 DAY),
          ('msg_g1_2', 'chat_group_1', 'user_nabil', 'Hey team! I booked the Keari Cruise ship tickets. We are set for Nov 15!', 'text', NOW() - INTERVAL 2 DAY),
          ('msg_g1_3', 'chat_group_1', 'user_siam', 'Awesome! I will handle the food arrangements and the BBQ coordination.', 'text', NOW() - INTERVAL 1 DAY),
          ('msg_g1_4', 'chat_group_1', 'user_nusrat', 'Should we rent cycles there or book a tour auto?', 'text', NOW() - INTERVAL 4 HOUR),
          ('msg_g2_1', 'chat_group_2', 'user_tariq', 'Welcome to the Sajek Valley trek! Make sure everyone reaches Dighinala by 9:30 AM for the military convoy.', 'text', NOW() - INTERVAL 1 DAY),
          ('msg_g2_2', 'chat_group_2', 'user_sadia', 'Got it! I am carrying power banks and camera gear.', 'text', NOW() - INTERVAL 6 HOUR),
          ('msg_g3_1', 'chat_group_3', 'user_sadia', 'Hello team! Cox\\'s Bazar Marine Drive itinerary is uploaded. Check the checklist!', 'text', NOW() - INTERVAL 12 HOUR)
        ON DUPLICATE KEY UPDATE \`message_text\` = VALUES(\`message_text\`);
      `);
    }

    // Seed sample expedition groups if empty
    const [expGroupCount] = await p.query("SELECT COUNT(*) as count FROM expedition_groups");
    if (expGroupCount[0].count === 0) {
      console.log("🌱 Seeding initial expedition groups into lagatour_db...");

      const itineraryStMartin = JSON.stringify([
        { day: "Day 1", plan: "Depart Dhaka by night AC bus to Teknaf. Board Keari Sindbad ship at 9:30 AM to St. Martin. Check in at Coral View Resort and sunset at West Beach." },
        { day: "Day 2", plan: "Morning speed boat or cycle ride to Chera Dwip coral reef. Snorkeling and fresh seafood lunch. Evening BBQ party with campfire." },
        { day: "Day 3", plan: "Sunrise photography at East Beach. Souvenir shopping and return ship to Teknaf at 3 PM. Overnight bus back to Dhaka." }
      ]);

      const itinerarySajek = JSON.stringify([
        { day: "Day 1", plan: "Arrival at Khagrachhari. Morning Army convoy from Dighinala to Sajek Valley. Check in at Meghpunji Resort. Sunset from Helipad." },
        { day: "Day 2", plan: "4:30 AM trek to Konglak Peak for sunrise cloud ocean walk. Visit Lusai Village, Ruilui Para, and bamboo chicken dinner." },
        { day: "Day 3", plan: "Morning convoy back to Khagrachhari. Visit Risang Waterfall and Alutila Mysterious Cave. Return bus to Dhaka." }
      ]);

      const itineraryCox = JSON.stringify([
        { day: "Day 1", plan: "Depart Dhaka by overnight bus. Check in at Mermaid Eco Resort. Sunset at Inani Beach and fresh crab fry." },
        { day: "Day 2", plan: "Marine Drive road trip to Teknaf by open jeep. Photography at Himchari waterfall and parasailing at Kolatoli." },
        { day: "Day 3", plan: "Morning beach volleyball, Burmese market shopping, and evening return journey to Dhaka." }
      ]);

      await p.query(`
        INSERT INTO \`expedition_groups\` (\`group_id\`, \`organizer_id\`, \`conversation_id\`, \`title\`, \`destination\`, \`travel_date\`, \`estimated_budget\`, \`max_members\`, \`transportation\`, \`accommodation_plan\`, \`itinerary\`, \`status\`)
        VALUES
          ('group_stmartin', 'user_nabil', 'chat_group_1', 'St. Martin\\'s Weekend Expedition 🌊', 'Saint Martin\\'s Island', '2026-11-15', 8500.00, 10, 'AC Bus & Keari Ship', 'Coral View Resort & Beach Camping', ?, 'open'),
          ('group_sajek', 'user_tariq', 'chat_group_2', 'Sajek Valley & Konglak Peak Cloud Walk ☁️', 'Sajek Valley', '2026-12-05', 6500.00, 8, '4x4 Chander Gari Jeep', 'Meghpunji Resort Ruilui Para', ?, 'open'),
          ('group_coxsbazar', 'user_sadia', 'chat_group_3', 'Cox\\'s Bazar Marine Drive Rally 🏖️', 'Cox\\'s Bazar Beach', '2026-12-10', 8000.00, 8, 'AC Luxury Bus', 'Mermaid Eco Resort & Spa', ?, 'open')
        ON DUPLICATE KEY UPDATE \`title\` = VALUES(\`title\`);
      `, [itineraryStMartin, itinerarySajek, itineraryCox]);

      // Seed expedition members
      await p.query(`
        INSERT INTO \`expedition_members\` (\`id\`, \`group_id\`, \`user_id\`, \`role\`, \`status\`, \`joined_at\`)
        VALUES
          ('em_1', 'group_stmartin', 'user_nabil', 'organizer', 'accepted', NOW() - INTERVAL 3 DAY),
          ('em_2', 'group_stmartin', 'user_siam', 'member', 'accepted', NOW() - INTERVAL 3 DAY),
          ('em_3', 'group_stmartin', 'user_nusrat', 'member', 'accepted', NOW() - INTERVAL 2 DAY),
          ('em_4', 'group_stmartin', 'user_tanvir', 'member', 'pending', NOW() - INTERVAL 1 DAY),
          ('em_5', 'group_sajek', 'user_tariq', 'organizer', 'accepted', NOW() - INTERVAL 2 DAY),
          ('em_6', 'group_sajek', 'user_sadia', 'member', 'accepted', NOW() - INTERVAL 2 DAY),
          ('em_7', 'group_sajek', 'user_rayan', 'member', 'accepted', NOW() - INTERVAL 1 DAY),
          ('em_8', 'group_coxsbazar', 'user_sadia', 'organizer', 'accepted', NOW() - INTERVAL 1 DAY),
          ('em_9', 'group_coxsbazar', 'user_farhana', 'member', 'accepted', NOW() - INTERVAL 1 DAY)
        ON DUPLICATE KEY UPDATE \`status\` = VALUES(\`status\`);
      `);

      // Seed expedition checklists
      await p.query(`
        INSERT INTO \`expedition_checklists\` (\`task_id\`, \`group_id\`, \`task\`,\`is_completed\`, \`assigned_to_user_id\`, \`assigned_to_name\`)
        VALUES
          ('chk_1', 'group_stmartin', 'Book Keari Cruise ship group tickets', 1, 'user_nabil', 'Nabil Ahmed'),
          ('chk_2', 'group_stmartin', 'Confirm Coral View Resort rooms with sea view', 1, 'user_nabil', 'Nabil Ahmed'),
          ('chk_3', 'group_stmartin', 'Arrange night BBQ setup & fresh coral fish', 1, 'user_siam', 'Siam Chowdhury'),
          ('chk_4', 'group_stmartin', 'Rent bicycles for Chera Dwip morning coral ride', 0, 'user_nusrat', 'Nusrat Jahan'),
          ('chk_5', 'group_stmartin', 'Carry first-aid kit and anti-seasickness medicine', 0, 'user_siam', 'Siam Chowdhury'),
          ('chk_6', 'group_sajek', 'Coordinate 10 AM Dighinala Army Convoy entry', 1, 'user_tariq', 'Tariq Islam'),
          ('chk_7', 'group_sajek', 'Confirm Meghpunji cottage booking in Ruilui Para', 1, 'user_sadia', 'Sadia Rahman'),
          ('chk_8', 'group_sajek', 'Hire 4x4 Chander Gari driver for 3 days', 0, 'user_tariq', 'Tariq Islam'),
          ('chk_9', 'group_coxsbazar', 'Book AC Bus group seats', 1, 'user_sadia', 'Sadia Rahman'),
          ('chk_10', 'group_coxsbazar', 'Reserve Mermaid Eco Resort beach cottages', 1, 'user_sadia', 'Sadia Rahman'),
          ('chk_11', 'group_coxsbazar', 'Arrange open jeep rental for Marine Drive rally', 0, 'user_farhana', 'Farhana Yasmin')
        ON DUPLICATE KEY UPDATE \`task\` = VALUES(\`task\`);
      `);

      // Seed expedition expenses
      await p.query(`
        INSERT INTO \`expedition_expenses\` (\`expense_id\`, \`group_id\`, \`title\`, \`amount\`, \`paid_by_user_id\`, \`paid_by_name\`, \`date\`)
        VALUES
          ('exp_1', 'group_stmartin', 'Cruise Ship Tickets (Roundtrip)', 7200.00, 'user_nabil', 'Nabil Ahmed', '2026-11-01'),
          ('exp_2', 'group_stmartin', 'Resort Advance Booking Deposit', 9500.00, 'user_siam', 'Siam Chowdhury', '2026-11-02'),
          ('exp_3', 'group_sajek', '4x4 Chander Gari 3-Day Jeep Rental', 10500.00, 'user_tariq', 'Tariq Islam', '2026-11-10'),
          ('exp_4', 'group_coxsbazar', 'Mermaid Resort Deposit', 12000.00, 'user_sadia', 'Sadia Rahman', '2026-11-12')
        ON DUPLICATE KEY UPDATE \`title\` = VALUES(\`title\`);
      `);
    }

}

export default {
  getPool,
  query,
  initDatabase
};
