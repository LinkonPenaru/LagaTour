// LagaTour Backend API Client
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/**
 * Helper to handle fetch responses and throw meaningful errors
 */
async function handleResponse(response) {
  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData && errorData.message) {
        errorMsg = errorData.message;
      }
    } catch {
      // Ignored
    }
    throw new Error(errorMsg);
  }
  return response.json();
}

export const api = {
  /**
   * Health Check
   */
  async checkHealth() {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      return await handleResponse(res);
    } catch (err) {
      console.warn("Backend health check failed:", err.message);
      return null;
    }
  },

  // ===================== AUTH & USER PROFILE =====================

  /**
   * Send 6-digit email OTP verification code
   */
  async sendVerificationCode(email, purpose = "signup") {
    const res = await fetch(`${API_BASE_URL}/auth/send-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, purpose })
    });
    return await handleResponse(res);
  },

  /**
   * Verify email OTP code
   */
  async verifyCode(email, code, purpose = "signup") {
    const res = await fetch(`${API_BASE_URL}/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, purpose })
    });
    return await handleResponse(res);
  },

  /**
   * User Signup (requires verified code, stores hashed password in MySQL)
   */
  async signup(name, email, password, code) {
    const res = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, code })
    });
    return await handleResponse(res);
  },

  /**
   * User Login (authenticates against MySQL hashed password)
   */
  async login(email, password) {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    return await handleResponse(res);
  },

  /**
   * Forgot Password Reset (using verified 6-digit OTP code)
   */
  async forgotPassword(email, code, newPassword) {
    const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, newPassword })
    });
    return await handleResponse(res);
  },

  /**
   * Update User Profile in MySQL
   */
  async updateProfile(profileData) {
    const res = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileData)
    });
    return await handleResponse(res);
  },

  /**
   * Get User Profile from MySQL
   */
  async getUserProfile(userId) {
    const res = await fetch(`${API_BASE_URL}/auth/profile/${userId}`);
    return await handleResponse(res);
  },

  // ===================== POSTS & INTERACTIONS =====================

  /**
   * Fetch all posts from backend MySQL
   */
  async fetchPosts(userId = null, includeHidden = false) {
    const params = new URLSearchParams();
    if (userId) params.append("userId", userId);
    if (includeHidden) params.append("includeHidden", "true");

    const url = `${API_BASE_URL}/posts${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url);
    const data = await handleResponse(res);
    return data.posts || [];
  },

  /**
   * Create a new post in MySQL
   */
  async createPost(postPayload) {
    const res = await fetch(`${API_BASE_URL}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postPayload)
    });
    const data = await handleResponse(res);
    return data.post;
  },

  /**
   * Verify post media with AI visual moderation service
   */
  async verifyPostMedia(mediaItems, destination = "") {
    const res = await fetch(`${API_BASE_URL}/posts/verify-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media: mediaItems, destination })
    });
    return await handleResponse(res);
  },

  /**
   * Like / Unlike a post
   */
  async likePost(postId, user) {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    });
    return await handleResponse(res);
  },

  /**
   * Add a comment to a post
   */
  async commentPost(postId, user, text, parentCommentId = null) {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, text, parentCommentId })
    });
    const data = await handleResponse(res);
    return data.comment;
  },

  /**
   * Save / Bookmark a post
   */
  async savePost(postId, user) {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    });
    return await handleResponse(res);
  },

  /**
   * Share a post (increments shares count)
   */
  async sharePost(postId) {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    return await handleResponse(res);
  },

  /**
   * Report a post to admin moderation
   */
  async reportPost(postId, user, reason, reporterName = "") {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, reason, reporterName })
    });
    return await handleResponse(res);
  },

  /**
   * Fetch all moderation reports (for Admin Panel)
   */
  async fetchReports() {
    const res = await fetch(`${API_BASE_URL}/reports`);
    const data = await handleResponse(res);
    return data.reports || [];
  },

  /**
   * Fetch all posts authored by a user
   */
  async getUserPosts(userId, currentUserId = null) {
    const params = new URLSearchParams();
    if (currentUserId) params.append("currentUserId", currentUserId);

    const url = `${API_BASE_URL}/posts/user/${userId}${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url);
    const data = await handleResponse(res);
    return data.posts || [];
  },

  /**
   * Fetch all posts saved/bookmarked by a user from MySQL
   */
  async getSavedPosts(userId) {
    const url = `${API_BASE_URL}/posts/saved/${userId}`;
    const res = await fetch(url);
    const data = await handleResponse(res);
    return data.posts || [];
  },

  /**
   * Update a post in MySQL
   */
  async updatePost(postId, postData) {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postData)
    });
    return await handleResponse(res);
  },

  /**
   * Permanently delete a post from MySQL
   */
  async deletePost(postId) {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Update post visibility (Make Private / Public)
   */
  async updatePostVisibility(postId, isPublic) {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}/visibility`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic })
    });
    return await handleResponse(res);
  },

  /**
   * Dismiss a report
   */
  async dismissReport(reportId) {
    const res = await fetch(`${API_BASE_URL}/reports/${reportId}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  // ===================== CHAT & MESSAGING =====================

  /**
   * Fetch all conversations for a user
   */
  async fetchUserConversations(userId) {
    const res = await fetch(`${API_BASE_URL}/chats?userId=${encodeURIComponent(userId)}`);
    const data = await handleResponse(res);
    return data.chats || [];
  },

  /**
   * Fetch message history for a conversation
   */
  async fetchChatMessages(conversationId, userId = null) {
    const params = new URLSearchParams();
    if (userId) params.append("userId", userId);
    const url = `${API_BASE_URL}/chats/${encodeURIComponent(conversationId)}/messages${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url);
    const data = await handleResponse(res);
    return data.messages || [];
  },

  /**
   * Get or create 1-on-1 direct chat
   */
  async getOrCreateDirectChat(userId1, userId2) {
    const senderId = userId1?.id || userId1?.user_id || userId1;
    const recipientId = userId2?.id || userId2?.user_id || userId2;
    const res = await fetch(`${API_BASE_URL}/chats/direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, recipientId, userId1: senderId, userId2: recipientId })
    });
    const data = await handleResponse(res);
    return data.conversation || data.chat;
  },

  /**
   * Create a new group chat
   */
  async createGroupChat(groupData) {
    const res = await fetch(`${API_BASE_URL}/chats/group`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(groupData)
    });
    const data = await handleResponse(res);
    return data.conversation || data.chat;
  },

  /**
   * Send a message to a conversation
   */
  async sendChatMessage(conversationId, messageData) {
    const res = await fetch(`${API_BASE_URL}/chats/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messageData)
    });
    const data = await handleResponse(res);
    return data.message;
  },

  /**
   * Mark all messages in a conversation as read by the user
   */
  async markConversationAsRead(conversationId, userId) {
    try {
      const res = await fetch(`${API_BASE_URL}/chats/${encodeURIComponent(conversationId)}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      return await handleResponse(res);
    } catch (err) {
      console.warn("markConversationAsRead note:", err.message);
      return null;
    }
  },

  /**
   * Edit a message in a conversation
   */
  async editChatMessage(conversationId, messageId, text, userId) {
    const res = await fetch(`${API_BASE_URL}/chats/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, userId })
    });
    return await handleResponse(res);
  },

  /**
   * Delete a message from a conversation
   */
  async deleteChatMessage(conversationId, messageId, userId) {
    const res = await fetch(`${API_BASE_URL}/chats/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    return await handleResponse(res);
  },

  /**
   * Search all travelers across the platform by username or full name
   */
  async searchChatUsers(searchTerm = "", currentUserId = null) {
    const params = new URLSearchParams();
    if (searchTerm) params.append("q", searchTerm);
    if (currentUserId) params.append("currentUserId", currentUserId);

    const res = await fetch(`${API_BASE_URL}/chats/users?${params.toString()}`);
    const data = await handleResponse(res);
    return data.users || [];
  },

  // ===================== PLACE TRACKING & "MY PLACES" =====================


  /**
   * Fetch all divisions and districts
   */
  async fetchLocations() {
    try {
      const res = await fetch(`${API_BASE_URL}/places/locations`);
      return await handleResponse(res);
    } catch {
      return { divisions: [], districts: [] };
    }
  },

  /**
   * Fetch nearby places within a radius using user's coordinates
   */
  async fetchNearbyPlaces(lat, lng, radius = 15) {
    const res = await fetch(`${API_BASE_URL}/places/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
    const data = await handleResponse(res);
    return data.places || [];
  },

  /**
   * Quick save current location with placeholder name to My Places
   */
  async quickSavePlace(payload) {
    const res = await fetch(`${API_BASE_URL}/places/quick-save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await handleResponse(res);
  },

  /**
   * Link an existing nearby place to user's My Places
   */
  async linkExistingPlace(user, placeId) {
    const res = await fetch(`${API_BASE_URL}/places/link-existing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, placeId })
    });
    return await handleResponse(res);
  },

  /**
   * Fetch all places in user's "My Places"
   */
  async fetchUserMyPlaces(userId) {
    const res = await fetch(`${API_BASE_URL}/places/my-places/${userId}`);
    const data = await handleResponse(res);
    return data.places || [];
  },

  /**
   * Update place details, upload photos, division, district, safety rating, and publish
   */
  async updatePlace(placeId, payload) {
    const res = await fetch(`${API_BASE_URL}/places/${placeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await handleResponse(res);
  },

  /**
   * Fetch public community places feed with filters
   */
  async fetchPublicPlaces(filters = {}) {
    const params = new URLSearchParams();
    if (filters.userId) params.append("userId", filters.userId);
    if (filters.divisionId && filters.divisionId !== "All") params.append("divisionId", filters.divisionId);
    if (filters.districtId && filters.districtId !== "All") params.append("districtId", filters.districtId);
    if (filters.safetyFilter && filters.safetyFilter !== "All") params.append("safetyFilter", filters.safetyFilter);
    if (filters.search) params.append("search", filters.search);

    const url = `${API_BASE_URL}/places${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url);
    const data = await handleResponse(res);
    return data.places || [];
  },

  /**
   * Submit safety rating on a place (validates place is in My Places)
   */
  async ratePlaceSafety(placeId, user, safetyRating, reviewText) {
    const res = await fetch(`${API_BASE_URL}/places/${placeId}/rate-safety`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, safetyRating, reviewText })
    });
    return await handleResponse(res);
  },

  /**
   * Toggle like on a place
   */
  async likePlace(placeId, user) {
    const res = await fetch(`${API_BASE_URL}/places/${placeId}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    });
    return await handleResponse(res);
  },

  /**
   * Add comment to a place
   */
  async commentPlace(placeId, user, commentText) {
    const res = await fetch(`${API_BASE_URL}/places/${placeId}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, commentText })
    });
    return await handleResponse(res);
  },

  /**
   * Toggle save place to My Places
   */
  async savePlace(placeId, user) {
    const res = await fetch(`${API_BASE_URL}/places/${placeId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    });
    return await handleResponse(res);
  },

  /**
   * Report a place
   */
  async reportPlace(placeId, user, reason) {
    const res = await fetch(`${API_BASE_URL}/places/${placeId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, reason })
    });
    return await handleResponse(res);
  },

  /**
   * Delete place from My Places
   */
  async deleteFromMyPlaces(placeId, userId) {
    const res = await fetch(`${API_BASE_URL}/places/my-places/${placeId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    return await handleResponse(res);
  },

  // ===================== RANKINGS & LEADERBOARDS =====================

  /**
   * Fetch rankings overview (top 3 in all categories + platform stats + personal rank)
   */
  async fetchRankingsOverview(userId = null) {
    const params = new URLSearchParams();
    if (userId) params.append("userId", userId);
    const url = `${API_BASE_URL}/rankings/overview${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url);
    return await handleResponse(res);
  },

  /**
   * Fetch ranked travelers leaderboard with filters
   */
  async fetchRankedTravelers({ league = "All", search = "", sortBy = "points", limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (league) params.append("league", league);
    if (search) params.append("search", search);
    if (sortBy) params.append("sortBy", sortBy);
    if (limit) params.append("limit", limit);
    if (offset) params.append("offset", offset);

    const res = await fetch(`${API_BASE_URL}/rankings/travelers?${params.toString()}`);
    return await handleResponse(res);
  },

  /**
   * Fetch Master Tour Guides leaderboard
   */
  async fetchRankedGuides({ search = "", division = "All", limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (division) params.append("division", division);
    if (limit) params.append("limit", limit);
    if (offset) params.append("offset", offset);

    const res = await fetch(`${API_BASE_URL}/rankings/guides?${params.toString()}`);
    return await handleResponse(res);
  },

  /**
   * Fetch ranked Tour Plans & Itineraries
   */
  async fetchRankedPlans({ sortBy = "rating", travelType = "All", search = "", limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (sortBy) params.append("sortBy", sortBy);
    if (travelType) params.append("travelType", travelType);
    if (search) params.append("search", search);
    if (limit) params.append("limit", limit);
    if (offset) params.append("offset", offset);

    const res = await fetch(`${API_BASE_URL}/rankings/plans?${params.toString()}`);
    return await handleResponse(res);
  },

  /**
   * Fetch top ranked Tourist Spots & Hidden Gems
   */
  async fetchRankedPlaces({ division = "All", search = "", limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (division) params.append("division", division);
    if (search) params.append("search", search);
    if (limit) params.append("limit", limit);
    if (offset) params.append("offset", offset);

    const res = await fetch(`${API_BASE_URL}/rankings/places?${params.toString()}`);
    return await handleResponse(res);
  },

  // ===================== TOUR PLANS & EXPEDITIONS =====================

  /**
   * Fetch all tour plans / expeditions with filters
   */
  async fetchTourPlans(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== "all") params.append("status", filters.status);
    if (filters.travelType && filters.travelType !== "All") params.append("travelType", filters.travelType);
    if (filters.season && filters.season !== "All") params.append("season", filters.season);
    if (filters.transportation && filters.transportation !== "All") params.append("transportation", filters.transportation);
    if (filters.destination && filters.destination !== "All") params.append("destination", filters.destination);
    if (filters.search) params.append("search", filters.search);
    if (filters.userId) params.append("userId", filters.userId);
    if (filters.currentUserId) params.append("currentUserId", filters.currentUserId);
    if (filters.maxBudget) params.append("maxBudget", filters.maxBudget);
    if (filters.sortBy) params.append("sortBy", filters.sortBy);
    if (filters.limit) params.append("limit", filters.limit);
    if (filters.offset) params.append("offset", filters.offset);

    const res = await fetch(`${API_BASE_URL}/tour-plans?${params.toString()}`);
    const data = await handleResponse(res);
    return data.expeditions || [];
  },

  /**
   * Fetch single tour plan by ID
   */
  async fetchTourPlanById(id, currentUserId = null) {
    const params = new URLSearchParams();
    if (currentUserId) params.append("currentUserId", currentUserId);
    const res = await fetch(`${API_BASE_URL}/tour-plans/${id}${params.toString() ? `?${params.toString()}` : ""}`);
    const data = await handleResponse(res);
    return data.expedition || null;
  },

  /**
   * Create a new tour plan
   */
  async createTourPlan(payload) {
    const res = await fetch(`${API_BASE_URL}/tour-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await handleResponse(res);
  },

  /**
   * Update tour plan details and stops
   */
  async updateTourPlan(id, payload) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await handleResponse(res);
  },

  /**
   * Delete tour plan
   */
  async deleteTourPlan(id) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${id}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Start expedition (transitions to 'ongoing')
   */
  async startTourPlan(id, userId = null) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${id}/start`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    return await handleResponse(res);
  },

  /**
   * End expedition (transitions to 'completed')
   */
  async endTourPlan(id, userId = null) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${id}/end`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    return await handleResponse(res);
  },

  /**
   * Restart expedition (resets stops & starts new ongoing live cockpit)
   */
  async restartTourPlan(id, userId = null) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${id}/restart`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    return await handleResponse(res);
  },

  /**
   * Live GPS Check-in at a planned stop
   */
  async checkInTourStop(tourId, checkInData) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${tourId}/stops/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkInData)
    });
    return await handleResponse(res);
  },

  /**
   * Skip a scheduled stop
   */
  async skipTourStop(tourId, stopId, reason) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${tourId}/stops/${stopId}/skip`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });
    return await handleResponse(res);
  },

  /**
   * Add a spontaneous / unexpected stop discovered on the road
   */
  async addSpontaneousTourStop(tourId, discoveryData) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${tourId}/stops/spontaneous`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discoveryData)
    });
    return await handleResponse(res);
  },

  /**
   * Add an expense to a tour plan
   */
  async addTourExpense(tourId, expenseData) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${tourId}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expenseData)
    });
    return await handleResponse(res);
  },

  /**
   * Delete an expense
   */
  async deleteTourExpense(tourId, expenseId) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${tourId}/expenses/${expenseId}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Toggle like for a tour plan
   */
  async likeTourPlan(tourId, user) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${tourId}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    });
    return await handleResponse(res);
  },

  /**
   * Toggle save / bookmark for a tour plan
   */
  async saveTourPlan(tourId, user) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${tourId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    });
    return await handleResponse(res);
  },

  /**
   * Submit rating & review for a tour plan
   */
  async rateTourPlan(tourId, user, rating, reviewText) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${tourId}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, rating, reviewText })
    });
    return await handleResponse(res);
  },

  /**
   * Add comment to a tour plan
   */
  async commentTourPlan(tourId, user, commentText) {
    const res = await fetch(`${API_BASE_URL}/tour-plans/${tourId}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, commentText })
    });
    return await handleResponse(res);
  },

  /**
   * ==========================================
   * FOLLOWER & FOLLOWING APIs
   * ==========================================
   */

  /**
   * Toggle follow / unfollow a user
   */
  async toggleFollowUser(targetUserId, followerId) {
    const res = await fetch(`${API_BASE_URL}/users/${targetUserId}/follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followerId })
    });
    return await handleResponse(res);
  },

  /**
   * Get follow status between current user and target user
   */
  async getFollowStatus(targetUserId, followerId = null) {
    const query = followerId ? `?followerId=${encodeURIComponent(followerId)}` : "";
    const res = await fetch(`${API_BASE_URL}/users/${targetUserId}/follow-status${query}`);
    return await handleResponse(res);
  },

  /**
   * Get followers list of a user
   */
  async getFollowers(targetUserId, viewerId = null) {
    const query = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
    const res = await fetch(`${API_BASE_URL}/users/${targetUserId}/followers${query}`);
    return await handleResponse(res);
  },

  /**
   * Get following list of a user
   */
  async getFollowing(targetUserId, viewerId = null) {
    const query = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
    const res = await fetch(`${API_BASE_URL}/users/${targetUserId}/following${query}`);
    return await handleResponse(res);
  },

  /**
   * Get connected travelers (followers & following) for companion invite
   */
  async getConnectedTravelers(userId) {
    const res = await fetch(`${API_BASE_URL}/users/${userId}/connected-travelers`);
    return await handleResponse(res);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP PLANNER / EXPEDITIONS API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch all group expeditions from MySQL
   */
  async fetchGroups(params = {}) {
    const query = new URLSearchParams();
    if (params.userId) query.append("userId", params.userId);
    if (params.destination && params.destination !== "All") query.append("destination", params.destination);
    if (params.status && params.status !== "all") query.append("status", params.status);

    const url = `${API_BASE_URL}/groups${query.toString() ? `?${query.toString()}` : ""}`;
    const res = await fetch(url);
    const data = await handleResponse(res);
    return data.groups || [];
  },

  /**
   * Fetch full details of an expedition group (workspace, checklist, expenses, members, chat info)
   */
  async fetchGroupDetails(groupId, userId = null) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}${query}`);
    const data = await handleResponse(res);
    return data.group || null;
  },

  /**
   * Create a new group expedition (auto-creates linked group chat in conversations)
   */
  async createGroupExpedition(groupData) {
    const res = await fetch(`${API_BASE_URL}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(groupData)
    });
    return await handleResponse(res);
  },

  /**
   * Send a join request to an expedition group
   */
  async joinGroupExpedition(groupId, userData) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: userData })
    });
    return await handleResponse(res);
  },

  /**
   * Withdraw / Cancel a pending join request
   */
  async withdrawJoinRequest(groupId, userId) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/join?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Organizer accepts or rejects join request (accepting automatically adds user to group chat)
   */
  async respondToJoinRequest(groupId, targetUserId, status, organizerId = null) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/members/${targetUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, organizerId })
    });
    return await handleResponse(res);
  },

  /**
   * Add a collaborative task to expedition checklist
   */
  async addGroupChecklistTask(groupId, taskData) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskData)
    });
    return await handleResponse(res);
  },

  /**
   * Toggle task completion status
   */
  async toggleGroupChecklistTask(groupId, taskId, completed) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/checklist/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed })
    });
    return await handleResponse(res);
  },

  /**
   * Delete checklist task
   */
  async deleteGroupChecklistTask(groupId, taskId) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/checklist/${taskId}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Log a shared group expense
   */
  async addGroupExpense(groupId, expenseData) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expenseData)
    });
    return await handleResponse(res);
  },

  /**
   * Delete expense record
   */
  async deleteGroupExpense(groupId, expenseId) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/expenses/${expenseId}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Delete / Cancel expedition
   */
  async deleteGroupExpedition(groupId, userId = null) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}${query}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Propose an itinerary appeal / activity suggestion
   */
  async addItinerarySuggestion(groupId, suggestionData) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/itinerary-suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(suggestionData)
    });
    return await handleResponse(res);
  },

  /**
   * Creator reviews itinerary suggestion (accept / reject with optional reason)
   */
  async respondToItinerarySuggestion(groupId, suggestionId, status, rejectionReason = "", organizerId = null) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/itinerary-suggestions/${suggestionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejectionReason, organizerId })
    });
    return await handleResponse(res);
  },

  /**
   * Withdraw / Delete an itinerary suggestion
   */
  async deleteItinerarySuggestion(groupId, suggestionId) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/itinerary-suggestions/${suggestionId}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  // ===================== ADMIN PANEL ENDPOINTS =====================

  /**
   * Get Admin Overview & system-wide metrics from MySQL
   */
  async getAdminOverview() {
    const res = await fetch(`${API_BASE_URL}/admin/overview`);
    return await handleResponse(res);
  },

  /**
   * Fetch all users for Admin management
   */
  async getAdminUsers(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE_URL}/admin/users${query ? `?${query}` : ""}`);
    return await handleResponse(res);
  },

  /**
   * Create a new user account directly in MySQL
   */
  async createAdminUser(userData) {
    const res = await fetch(`${API_BASE_URL}/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData)
    });
    return await handleResponse(res);
  },

  /**
   * Update an existing user in MySQL
   */
  async updateAdminUser(id, userData) {
    const res = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData)
    });
    return await handleResponse(res);
  },

  /**
   * Change user account status (active / suspended)
   */
  async toggleUserStatus(id, status) {
    const res = await fetch(`${API_BASE_URL}/admin/users/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    return await handleResponse(res);
  },

  /**
   * Delete user permanently from MySQL
   */
  async deleteAdminUser(id) {
    const res = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Send an administrative warning to a user
   */
  async warnAdminUser(id, warningMessage, reason) {
    const res = await fetch(`${API_BASE_URL}/admin/users/${id}/warn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warningMessage, reason })
    });
    return await handleResponse(res);
  },

  /**
   * Fetch all posts for admin moderation
   */
  async getAdminPosts(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE_URL}/admin/posts${query ? `?${query}` : ""}`);
    return await handleResponse(res);
  },

  /**
   * Create a post/announcement as administrator
   */
  async createAdminPost(postData) {
    const res = await fetch(`${API_BASE_URL}/admin/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postData)
    });
    return await handleResponse(res);
  },

  /**
   * Update an existing post as administrator
   */
  async updateAdminPost(id, postData) {
    const res = await fetch(`${API_BASE_URL}/admin/posts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postData)
    });
    return await handleResponse(res);
  },

  /**
   * Toggle post visibility (public vs hidden)
   */
  async togglePostVisibility(id, isPublic) {
    const res = await fetch(`${API_BASE_URL}/admin/posts/${id}/visibility`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic })
    });
    return await handleResponse(res);
  },

  /**
   * Update AI media verification status
   */
  async verifyPostMedia(postId, mediaId, status, adminNotes = "") {
    const res = await fetch(`${API_BASE_URL}/admin/posts/${postId}/media/${mediaId}/verify`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNotes })
    });
    return await handleResponse(res);
  },

  /**
   * Delete post by administrator
   */
  async deletePostByAdmin(id) {
    const res = await fetch(`${API_BASE_URL}/admin/posts/${id}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Fetch tour plans for admin auditing
   */
  async getAdminTourPlans(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE_URL}/admin/tour-plans${query ? `?${query}` : ""}`);
    return await handleResponse(res);
  },

  /**
   * Delete tour plan by administrator
   */
  async deleteTourPlanByAdmin(id) {
    const res = await fetch(`${API_BASE_URL}/admin/tour-plans/${id}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Fetch places from MySQL
   */
  async getAdminPlaces(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE_URL}/admin/places${query ? `?${query}` : ""}`);
    return await handleResponse(res);
  },

  /**
   * Create a new tourist destination in MySQL
   */
  async createAdminPlace(placeData) {
    const res = await fetch(`${API_BASE_URL}/admin/places`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(placeData)
    });
    return await handleResponse(res);
  },

  /**
   * Update an existing place in MySQL
   */
  async updateAdminPlace(id, placeData) {
    const res = await fetch(`${API_BASE_URL}/admin/places/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(placeData)
    });
    return await handleResponse(res);
  },

  /**
   * Delete destination from MySQL
   */
  async deleteAdminPlace(id) {
    const res = await fetch(`${API_BASE_URL}/admin/places/${id}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Submit a user or post report
   */
  async createReport(reportData) {
    const res = await fetch(`${API_BASE_URL}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reportData)
    });
    return await handleResponse(res);
  },

  /**
   * Fetch user and content reports
   */
  async getAdminReports() {
    const res = await fetch(`${API_BASE_URL}/admin/reports`);
    return await handleResponse(res);
  },

  /**
   * Dismiss a report
   */
  async dismissAdminReport(id) {
    const res = await fetch(`${API_BASE_URL}/admin/reports/${id}`, {
      method: "DELETE"
    });
    return await handleResponse(res);
  },

  /**
   * Resolve a report with specific administrative action
   */
  async resolveAdminReport(id, action, notes) {
    const res = await fetch(`${API_BASE_URL}/admin/reports/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, notes })
    });
    return await handleResponse(res);
  },

  /**
   * Request support with an admin (traveler side)
   */
  async requestAdminSupport(userPayload) {
    const res = await fetch(`${API_BASE_URL}/admin/support/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userPayload)
    });
    return await handleResponse(res);
  },

  /**
   * Fetch all active & pending support requests (admin side)
   */
  async getAdminSupportRequests() {
    const res = await fetch(`${API_BASE_URL}/admin/support/requests`);
    return await handleResponse(res);
  },

  /**
   * Admin accepts a traveler's support request
   */
  async acceptAdminSupportRequest(requestId, adminPayload = {}) {
    const res = await fetch(`${API_BASE_URL}/admin/support/${requestId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adminPayload)
    });
    return await handleResponse(res);
  },

  /**
   * Admin resolves a support request
   */
  async resolveAdminSupportRequest(requestId, adminPayload = {}) {
    const res = await fetch(`${API_BASE_URL}/admin/support/${requestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adminPayload)
    });
    return await handleResponse(res);
  },

  /**
   * Create system broadcast / banner announcement
   */
  async createSystemAnnouncement(data) {
    const res = await fetch(`${API_BASE_URL}/admin/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return await handleResponse(res);
  },

  /**
   * Get active system announcements
   */
  async getActiveAnnouncements() {
    const res = await fetch(`${API_BASE_URL}/admin/announcements`);
    return await handleResponse(res);
  },

  // ===================== AI TOUR PACKAGE BUILDER =====================

  /**
   * Generate dual tour packages (LagaTour Database Grounded vs Web Explorer)
   */
  async buildAITourPackage(specs) {
    const res = await fetch(`${API_BASE_URL}/ai/build-package`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(specs)
    });
    return await handleResponse(res);
  },

  /**
   * Generate AI Tour Plans (Mode 1: Destination Max Spots, Mode 2: Nearby Sequenced Expedition)
   */
  async generateAITourPlans(specs) {
    const res = await fetch(`${API_BASE_URL}/ai/generate-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(specs)
    });
    return await handleResponse(res);
  }
};

export default api;


