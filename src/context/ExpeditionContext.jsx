import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { INITIAL_MOCK_EXPEDITIONS, BANGLADESH_PLACES_DATABASE, MOCK_COMPANIONS, MOCK_EXISTING_TOUR_GROUPS } from "../data/mockExpeditions";
import { useAuth } from "./AuthContext";
import { usePosts } from "./PostContext";
import api from "../services/api";
import { socketService } from "../services/socketService";
import confetti from "canvas-confetti";

const ExpeditionContext = createContext();

export function useExpeditions() {
  const context = useContext(ExpeditionContext);
  return context || {};
}

/**
 * Sort stops dynamically by check-in sequence:
 * Checked-in stops appear first ordered chronologically by checkInTime ASC,
 * followed by pending/planned stops ordered by their scheduled order ASC.
 */
export function sortStopsByCheckIn(stops = []) {
  const checked = [];
  const pending = [];
  for (const s of stops) {
    if (s.status === 'checked_in' && s.checkInTime) {
      checked.push(s);
    } else {
      pending.push(s);
    }
  }
  checked.sort((a, b) => new Date(a.checkInTime).getTime() - new Date(b.checkInTime).getTime());
  pending.sort((a, b) => (a.order || 0) - (b.order || 0));
  return [...checked, ...pending].map((s, idx) => ({ ...s, order: idx + 1 }));
}

export function ExpeditionProvider({ children }) {
  const { currentUser, addPoints } = useAuth();
  const { posts, createPost, updatePost } = usePosts();

  const [expeditions, setExpeditions] = useState(() => {
    const saved = localStorage.getItem("ts_expeditions");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Failed to parse saved expeditions", e);
      }
    }
    return INITIAL_MOCK_EXPEDITIONS;
  });

  const [activeExpeditionId, setActiveExpeditionId] = useState(() => {
    return localStorage.getItem("ts_active_expedition_id") || "exp_sylhet_haor_2026";
  });

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  // 1. Initial Load: Fetch Tour Plans from Backend MySQL API
  useEffect(() => {
    async function loadTourPlansFromBackend() {
      try {
        const backendPlans = await api.fetchTourPlans({ currentUserId: currentUser?.id || currentUser?.user_id });
        if (Array.isArray(backendPlans) && backendPlans.length > 0) {
          setExpeditions(prev => {
            const backendMap = new Map(backendPlans.map(p => [p.id, p]));
            // Merge: preserve locally created plans that aren't on server yet, and override with backend data
            const merged = [...backendPlans];
            for (const local of prev) {
              if (!backendMap.has(local.id)) {
                merged.push(local);
              }
            }
            return merged;
          });
          setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      } catch (err) {
        console.warn("Tour plans loaded from local storage (Backend offline or starting):", err.message);
      }
    }

    loadTourPlansFromBackend();
  }, [currentUser]);

  // 2. Real-time WebSocket Listeners
  useEffect(() => {
    const socket = socketService.connect(currentUser);
    if (!socket) return;

    const handleTourCreated = (newExp) => {
      setExpeditions(prev => {
        if (prev.some(e => e.id === newExp.id)) return prev;
        return [newExp, ...prev];
      });
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };

    const handleTourUpdated = (updatedExp) => {
      setExpeditions(prev => prev.map(e => {
        if (e.id === updatedExp.id) {
          return {
            ...e,
            ...updatedExp,
            stops: (Array.isArray(updatedExp.stops) && updatedExp.stops.length > 0)
              ? updatedExp.stops
              : (e.stops || [])
          };
        }
        return e;
      }));
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };

    const handleTourDeleted = ({ id }) => {
      setExpeditions(prev => prev.filter(e => e.id !== id));
      if (activeExpeditionId === id) setActiveExpeditionId(null);
    };

    const handleTourStarted = ({ id, status, expedition: backendExp }) => {
      setActiveExpeditionId(id);
      setExpeditions(prev => prev.map(e => {
        if (e.id === id) {
          if (backendExp) {
            return {
              ...e,
              ...backendExp,
              status: status || "ongoing",
              stops: (Array.isArray(backendExp.stops) && backendExp.stops.length > 0)
                ? backendExp.stops
                : (e.stops || [])
            };
          }
          return { ...e, status: status || "ongoing" };
        }
        return e;
      }));
    };

    const handleTourCompleted = ({ id, status }) => {
      setExpeditions(prev => prev.map(e => e.id === id ? { ...e, status } : e));
      if (activeExpeditionId === id) setActiveExpeditionId(null);
    };

    const handleStopCheckedIn = (data) => {
      const { tourId, stopId, gps, note, photos, checkInTime, stops } = data || {};
      setExpeditions(prev => prev.map(exp => {
        if (exp.id === tourId) {
          if (stops && Array.isArray(stops) && stops.length > 0) {
            return {
              ...exp,
              stops: stops,
              currentGps: gps ? { ...gps, lastUpdated: "Live Check-in" } : exp.currentGps
            };
          }
          const rawStops = (exp.stops || []).map(s => {
            if (s.id === stopId) {
              return {
                ...s,
                status: "checked_in",
                checkInTime: checkInTime || new Date().toISOString(),
                checkInGps: gps || s.checkInGps,
                checkInNote: note || s.checkInNote,
                photos: photos || s.photos
              };
            }
            return s;
          });
          return {
            ...exp,
            stops: sortStopsByCheckIn(rawStops),
            currentGps: gps ? { ...gps, lastUpdated: "Live Check-in" } : exp.currentGps
          };
        }
        return exp;
      }));
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };

    const handleSpontaneousAdded = ({ tourId, stop, stops }) => {
      setExpeditions(prev => prev.map(exp => {
        if (exp.id === tourId) {
          if (stops && Array.isArray(stops) && stops.length > 0) {
            return {
              ...exp,
              stops: stops,
              currentGps: { lat: stop.lat, lng: stop.lng, lastUpdated: "Spontaneous Discovery" }
            };
          }
          const curStops = exp.stops || [];
          const exists = curStops.some(s => s.id === stop.id);
          let updatedStops;
          if (exists) {
            updatedStops = curStops.map(s => s.id === stop.id ? { ...s, ...stop } : s);
          } else {
            const insertIdx = curStops.findIndex(s => s.order >= stop.order);
            const cloned = [...curStops];
            if (insertIdx !== -1) {
              cloned.splice(insertIdx, 0, stop);
            } else {
              cloned.push(stop);
            }
            updatedStops = cloned.map((s, idx) => ({ ...s, order: idx + 1 }));
          }
          return {
            ...exp,
            stops: updatedStops,
            currentGps: { lat: stop.lat, lng: stop.lng, lastUpdated: "Spontaneous Discovery" }
          };
        }
        return exp;
      }));
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };

    const handleTourRestarted = ({ id, status, restartedAt }) => {
      setExpeditions(prev => prev.map(exp => {
        if (exp.id === id) {
          const resetStops = (exp.stops || []).map(s => ({
            ...s,
            status: "pending",
            checkInTime: null,
            checkInGps: null,
            checkInNote: null,
            skipReason: null
          }));
          return {
            ...exp,
            status: status || "ongoing",
            expenses: [],
            spentBudget: 0,
            aiScore: null,
            stops: resetStops,
            currentGps: resetStops[0]?.lat ? { lat: resetStops[0].lat, lng: resetStops[0].lng, lastUpdated: "Restarted" } : exp.currentGps
          };
        }
        return exp;
      }));
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };

    socket.on("tour:created", handleTourCreated);
    socket.on("tour:updated", handleTourUpdated);
    socket.on("tour:deleted", handleTourDeleted);
    socket.on("tour:started", handleTourStarted);
    socket.on("tour:completed", handleTourCompleted);
    socket.on("tour:restarted", handleTourRestarted);
    socket.on("tour:stop_checked_in", handleStopCheckedIn);
    socket.on("tour:spontaneous_stop_added", handleSpontaneousAdded);

    return () => {
      socket.off("tour:created", handleTourCreated);
      socket.off("tour:updated", handleTourUpdated);
      socket.off("tour:deleted", handleTourDeleted);
      socket.off("tour:started", handleTourStarted);
      socket.off("tour:completed", handleTourCompleted);
      socket.off("tour:restarted", handleTourRestarted);
      socket.off("tour:stop_checked_in", handleStopCheckedIn);
      socket.off("tour:spontaneous_stop_added", handleSpontaneousAdded);
    };
  }, [currentUser, activeExpeditionId]);

  // Track online / offline connectivity
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem("ts_expeditions", JSON.stringify(expeditions));
  }, [expeditions]);

  useEffect(() => {
    if (activeExpeditionId) {
      localStorage.setItem("ts_active_expedition_id", activeExpeditionId);
    } else {
      localStorage.removeItem("ts_active_expedition_id");
    }
  }, [activeExpeditionId]);

  // Active expedition object
  const activeExpedition = expeditions.find(e => e.id === activeExpeditionId) || expeditions.find(e => e.status === "ongoing") || null;

  /**
   * Helper to sync modified expedition with any linked Social Feed Post
   */
  const syncWithSocialFeed = useCallback(async (expedition) => {
    if (!expedition || !expedition.isPublished) return;

    const checkedStops = (expedition.stops || []).filter(s => s.status === "checked_in");
    const spontaneousStops = (expedition.stops || []).filter(s => s.isSpontaneous);
    const totalSpent = (expedition.expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const captionSummary = `🗺️ Expedition Update: ${expedition.title}\n` +
      `📍 Route: ${expedition.startingLocation} ➔ ${expedition.destination} (${checkedStops.length}/${expedition.stops?.length || 0} stops covered)\n` +
      `💰 Budget: ${Number(totalSpent).toLocaleString()} / ${Number(expedition.targetBudget).toLocaleString()} BDT\n` +
      `${spontaneousStops.length > 0 ? `🌟 ${spontaneousStops.length} Spontaneous Discoveries logged!\n` : ''}` +
      `✨ ${expedition.description || ''}`;

    const mediaPhotos = checkedStops.flatMap(s => s.photos || []).filter(Boolean);
    const coverPhotos = mediaPhotos.length > 0 ? mediaPhotos : (expedition.coverImage ? [expedition.coverImage] : ["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800"]);

    // If an existing post is linked
    if (expedition.socialPostId && updatePost) {
      updatePost(expedition.socialPostId, {
        caption: captionSummary,
        images: coverPhotos,
        destination: expedition.destination,
        isPublic: true,
        expeditionData: {
          id: expedition.id,
          title: expedition.title,
          status: expedition.status,
          stopsCount: expedition.stops?.length || 0,
          checkedCount: checkedStops.length,
          spentBudget: totalSpent,
          targetBudget: expedition.targetBudget,
          season: expedition.season,
          travelType: expedition.travelType
        }
      });
    }
  }, [updatePost]);

  /**
   * Create a new Tour Plan / Expedition
   */
  const createExpedition = async (tourData) => {
    const authorUser = currentUser ? {
      id: currentUser.id || currentUser.user_id || "user_" + Date.now(),
      name: currentUser.name || "Adventurer",
      username: currentUser.username || "traveler",
      avatar: currentUser.avatar || "https://api.dicebear.com/7.x/adventurer/svg?seed=traveler",
      league: currentUser.league || "Adventurer",
      points: currentUser.points || 0
    } : {
      id: "guest",
      name: "Traveler",
      username: "traveler",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=guest",
      league: "Explorer",
      points: 100
    };

    const newId = "exp_" + Date.now();
    const newExpedition = {
      id: newId,
      title: tourData.title || `${tourData.startingLocation || 'Dhaka'} to ${tourData.destination || 'Sylhet'} Tour`,
      description: tourData.description || "A custom planned expedition across scenic locations.",
      startingLocation: tourData.startingLocation || "Dhaka",
      destination: tourData.destination || "Sylhet",
      startDate: tourData.startDate || new Date().toISOString().split("T")[0],
      endDate: tourData.endDate || new Date(Date.now() + 4 * 86400000).toISOString().split("T")[0],
      targetBudget: Number(tourData.targetBudget) || 25000,
      spentBudget: 0,
      status: tourData.status || "planned", // 'planned' | 'ongoing' | 'completed'
      travelType: tourData.travelType || "Friends",
      season: tourData.season || "Monsoon",
      transportation: tourData.transportation || "Bus",
      coverImage: tourData.coverImage || "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
      author: authorUser,
      companions: tourData.companions || [],
      stops: tourData.stops || [],
      expenses: [],
      currentGps: tourData.stops && tourData.stops[0] ? { lat: tourData.stops[0].lat, lng: tourData.stops[0].lng, lastUpdated: "Planned" } : { lat: 23.8103, lng: 90.4125, lastUpdated: "Planned" },
      isPublished: false,
      likes: 0,
      comments: []
    };

    // Optimistic state update
    setExpeditions(prev => [newExpedition, ...prev]);

    if (tourData.status === "ongoing") {
      setActiveExpeditionId(newId);
    }

    if (addPoints) {
      addPoints(75); // Points for creating tour plan
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
    }

    // Persist to MySQL Backend API
    try {
      const res = await api.createTourPlan(newExpedition);
      if (res && res.expedition) {
        setExpeditions(prev => prev.map(e => e.id === newId ? {
          ...res.expedition,
          stops: (Array.isArray(res.expedition.stops) && res.expedition.stops.length > 0)
            ? res.expedition.stops
            : e.stops
        } : e));
      }
    } catch (e) {
      console.warn("Tour plan saved locally, backend sync will retry:", e.message);
    }

    return newExpedition;
  };

  /**
   * Modify / Update an existing Tour Plan
   */
  const updateExpedition = async (tourId, updatedFields) => {
    let updatedObj = null;

    setExpeditions(prev => prev.map(exp => {
      if (exp.id === tourId) {
        // Recalculate spent budget from expenses if needed
        const currentExpenses = updatedFields.expenses || exp.expenses || [];
        const calculatedSpent = currentExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

        updatedObj = {
          ...exp,
          ...updatedFields,
          stops: updatedFields.stops !== undefined ? updatedFields.stops : exp.stops,
          spentBudget: updatedFields.spentBudget !== undefined ? updatedFields.spentBudget : calculatedSpent
        };
        return updatedObj;
      }
      return exp;
    }));

    if (updatedObj && updatedObj.isPublished) {
      syncWithSocialFeed(updatedObj);
    }

    // Sync to Backend
    try {
      const payloadToSend = {
        ...updatedFields,
        stops: updatedFields.stops !== undefined ? updatedFields.stops : updatedObj?.stops
      };
      await api.updateTourPlan(tourId, payloadToSend);
    } catch (e) {
      console.warn("Tour plan update cached locally:", e.message);
    }

    return updatedObj;
  };

  /**
   * Delete an expedition
   */
  const deleteExpedition = async (tourId) => {
    setExpeditions(prev => prev.filter(e => e.id !== tourId));
    if (activeExpeditionId === tourId) {
      setActiveExpeditionId(null);
    }

    try {
      await api.deleteTourPlan(tourId);
    } catch (e) {
      console.warn("Tour plan deletion pending backend sync:", e.message);
    }
  };

  /**
   * Start Tour / Transition to Ongoing Live Mode
   */
  const startExpedition = async (tourId) => {
    setActiveExpeditionId(tourId);

    let updatedObj = null;
    setExpeditions(prev => prev.map(exp => {
      if (exp.id === tourId) {
        updatedObj = {
          ...exp,
          status: "ongoing",
          actualStartedAt: new Date().toISOString()
        };
        return updatedObj;
      }
      return exp;
    }));

    if (addPoints) {
      addPoints(50);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }

    try {
      const res = await api.startTourPlan(tourId, currentUser?.id || currentUser?.user_id);
      if (res && res.expedition) {
        setExpeditions(prev => prev.map(e => e.id === tourId ? {
          ...res.expedition,
          status: "ongoing",
          stops: (Array.isArray(res.expedition.stops) && res.expedition.stops.length > 0)
            ? res.expedition.stops
            : e.stops
        } : e));
      }
    } catch (e) {
      console.warn("Tour plan start sync failed:", e.message);
    }

    return updatedObj;
  };

  /**
   * Restart an existing/previous Tour Plan (resets stops & starts new ongoing live cockpit)
   */
  const restartExpedition = async (tourId) => {
    const targetExp = expeditions.find(e => e.id === tourId);
    if (!targetExp) return null;

    const resetStops = (targetExp.stops || []).map(s => ({
      ...s,
      status: "pending",
      checkInTime: null,
      checkInGps: null,
      checkInNote: null,
      skipReason: null
    }));

    const resetFields = {
      status: "ongoing",
      spentBudget: 0,
      expenses: [],
      stops: resetStops,
      aiScore: null,
      currentGps: resetStops[0]?.lat ? {
        lat: resetStops[0].lat,
        lng: resetStops[0].lng,
        lastUpdated: "Expedition Restarted"
      } : targetExp.currentGps
    };

    setActiveExpeditionId(tourId);
    const updated = await updateExpedition(tourId, resetFields);

    if (addPoints) {
      addPoints(30);
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
    }

    try {
      await api.restartTourPlan(tourId, currentUser?.id || currentUser?.user_id);
    } catch (e) {
      console.warn("Tour plan restart pending backend sync:", e.message);
    }

    return updated;
  };

  /**
   * Check in at a scheduled stop with live GPS coordinates
   */
  const checkInStop = async (tourId, stopId, checkInData = {}) => {
    const targetExp = expeditions.find(e => e.id === tourId);
    if (!targetExp) return;

    const nowIso = new Date().toISOString();
    const updatedStops = (targetExp.stops || []).map(stop => {
      if (stop.id === stopId) {
        return {
          ...stop,
          status: "checked_in",
          checkInTime: nowIso,
          checkInGps: checkInData.gps || { lat: stop.lat, lng: stop.lng },
          checkInNote: checkInData.note || stop.notes || "Arrived safely and checked in!",
          photos: checkInData.photos || stop.photos || ["https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=500"]
        };
      }
      return stop;
    });

    // Optionally append an expense if included during check-in
    let updatedExpenses = [...(targetExp.expenses || [])];
    if (checkInData.expense && Number(checkInData.expense.amount) > 0) {
      updatedExpenses.push({
        id: "exp_" + Date.now(),
        stopId: stopId,
        category: checkInData.expense.category || "Accommodation",
        amount: Number(checkInData.expense.amount),
        note: checkInData.expense.note || `Expense logged at check-in`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }

    const currentGps = checkInData.gps || {
      lat: targetExp.stops.find(s => s.id === stopId)?.lat || 23.8103,
      lng: targetExp.stops.find(s => s.id === stopId)?.lng || 90.4125,
      lastUpdated: "Just now"
    };

    const sequencedStops = sortStopsByCheckIn(updatedStops);

    const updated = await updateExpedition(tourId, {
      stops: sequencedStops,
      expenses: updatedExpenses,
      currentGps: currentGps
    });

    if (addPoints) {
      addPoints(35); // Points for live GPS check-in
      confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 } });
    }

    // Backend sync with authoritative check-in resequencing
    try {
      const res = await api.checkInTourStop(tourId, {
        stopId,
        gps: checkInData.gps,
        note: checkInData.note,
        photos: checkInData.photos,
        expense: checkInData.expense,
        userId: currentUser?.id || currentUser?.user_id
      });
      if (res && res.stops && Array.isArray(res.stops) && res.stops.length > 0) {
        setExpeditions(prev => prev.map(exp => exp.id === tourId ? { ...exp, stops: res.stops } : exp));
      }
    } catch (e) {
      console.warn("Check-in recorded offline, will sync when reconnected.");
    }

    return updated;
  };

  /**
   * Skip a scheduled stop
   */
  const skipStop = async (tourId, stopId, reason = "Route altered due to time / weather") => {
    const targetExp = expeditions.find(e => e.id === tourId);
    if (!targetExp) return;

    const updatedStops = (targetExp.stops || []).map(stop => {
      if (stop.id === stopId) {
        return {
          ...stop,
          status: "skipped",
          skipReason: reason
        };
      }
      return stop;
    });

    const updated = await updateExpedition(tourId, { stops: updatedStops });

    try {
      await api.skipTourStop(tourId, stopId, reason);
    } catch (e) {}

    return updated;
  };

  /**
   * Dynamically add unexpected on-the-road discoveries (Spontaneous Discovery)
   */
  const addSpontaneousDiscovery = async (tourId, discoveryData) => {
    const targetExp = expeditions.find(e => e.id === tourId);
    if (!targetExp) return;

    const newStopId = discoveryData.id || discoveryData.stopId || ("stop_spont_" + Date.now());
    const existingStops = targetExp.stops || [];

    // Determine target insertion index based on user selection or last completed stop
    let insertIndex = -1;
    let targetOrder = null;

    if (discoveryData.insertAfterOrder !== undefined && discoveryData.insertAfterOrder !== null && !isNaN(Number(discoveryData.insertAfterOrder))) {
      targetOrder = Number(discoveryData.insertAfterOrder) + 1;
      insertIndex = existingStops.findIndex(s => (s.order || 0) >= targetOrder);
      if (insertIndex === -1) insertIndex = existingStops.length;
    } else if (discoveryData.insertAfterStopId) {
      const refIdx = existingStops.findIndex(s => s.id === discoveryData.insertAfterStopId);
      if (refIdx !== -1) {
        insertIndex = refIdx + 1;
        targetOrder = (existingStops[refIdx].order || refIdx + 1) + 1;
      }
    }

    if (insertIndex === -1) {
      // Find the last completed / checked-in stop
      let lastCheckedIdx = -1;
      for (let i = existingStops.length - 1; i >= 0; i--) {
        if (existingStops[i].status === 'checked_in') {
          lastCheckedIdx = i;
          break;
        }
      }
      if (lastCheckedIdx !== -1) {
        insertIndex = lastCheckedIdx + 1;
        targetOrder = (existingStops[lastCheckedIdx].order || lastCheckedIdx + 1) + 1;
      } else {
        insertIndex = existingStops.length > 0 ? 1 : 0;
        targetOrder = (existingStops[0]?.order || 1) + 1;
      }
    }

    const newSpontaneousStop = {
      id: newStopId,
      order: targetOrder || (insertIndex + 1),
      placeName: discoveryData.placeName || "Uncharted Scenic Spot",
      location: discoveryData.location || "On Route Discovery",
      lat: discoveryData.lat || (targetExp.currentGps?.lat ? targetExp.currentGps.lat + 0.02 : 24.3000),
      lng: discoveryData.lng || (targetExp.currentGps?.lng ? targetExp.currentGps.lng + 0.02 : 91.8000),
      transportMode: discoveryData.transportMode || "Local Transport",
      transportDetails: discoveryData.transportDetails || "Spontaneous road trip detour",
      transportCost: Number(discoveryData.transportCost) || 0,
      accommodationType: discoveryData.accommodationType || "Eco Cottage",
      accommodationDetails: discoveryData.accommodationDetails || "Local discovery",
      accommodationCost: Number(discoveryData.accommodationCost) || 0,
      stayDuration: discoveryData.stayDuration || "2 Hours",
      notes: discoveryData.notes || "Spontaneous on-the-road discovery found by travelers!",
      status: "checked_in",
      isSpontaneous: true,
      discoveryBadge: discoveryData.badge || "Hidden Gem",
      checkInTime: new Date().toISOString(),
      checkInGps: {
        lat: discoveryData.lat || 24.3000,
        lng: discoveryData.lng || 91.8000
      },
      checkInNote: discoveryData.notes || "Discovered on the road!",
      photos: discoveryData.photos && discoveryData.photos.length > 0 ? discoveryData.photos : ["https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500"]
    };

    let updatedExpenses = [...(targetExp.expenses || [])];
    if (discoveryData.expense && Number(discoveryData.expense.amount) > 0) {
      updatedExpenses.push({
        id: "exp_" + Date.now(),
        stopId: newStopId,
        category: discoveryData.expense.category || "Activities",
        amount: Number(discoveryData.expense.amount),
        note: `Spontaneous: ${discoveryData.placeName}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }

    const calculatedSpent = updatedExpenses.reduce((acc, x) => acc + (Number(x.amount) || 0), 0);

    // Optimistically update React state with proper position and resequenced orders
    let updatedExpedition = null;
    setExpeditions(prev => prev.map(exp => {
      if (exp.id === tourId) {
        const curStops = exp.stops || [];
        const alreadyHas = curStops.some(s => s.id === newStopId);
        let finalStops;
        if (alreadyHas) {
          finalStops = curStops;
        } else {
          const cloned = [...curStops];
          const pos = Math.min(Math.max(0, insertIndex), cloned.length);
          cloned.splice(pos, 0, newSpontaneousStop);
          finalStops = cloned.map((s, idx) => ({ ...s, order: idx + 1 }));
        }

        updatedExpedition = {
          ...exp,
          stops: finalStops,
          expenses: updatedExpenses,
          spentBudget: calculatedSpent,
          currentGps: {
            lat: newSpontaneousStop.lat,
            lng: newSpontaneousStop.lng,
            lastUpdated: "Spontaneous Discovery"
          }
        };
        return updatedExpedition;
      }
      return exp;
    }));

    if (addPoints) {
      addPoints(60); // Spontaneous discovery bonus
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }

    // Backend sync via single dedicated endpoint
    try {
      const res = await api.addSpontaneousTourStop(tourId, {
        ...discoveryData,
        id: newStopId,
        stopId: newStopId,
        insertAfterStopId: discoveryData.insertAfterStopId,
        insertAfterOrder: discoveryData.insertAfterOrder,
        userId: currentUser?.id || currentUser?.user_id
      });
      if (res && res.stops && Array.isArray(res.stops) && res.stops.length > 0) {
        setExpeditions(prev => prev.map(exp => {
          if (exp.id === tourId) {
            return {
              ...exp,
              stops: res.stops
            };
          }
          return exp;
        }));
      } else if (res && res.stop) {
        setExpeditions(prev => prev.map(exp => {
          if (exp.id === tourId) {
            return {
              ...exp,
              stops: (exp.stops || []).map(s => s.id === newStopId ? { ...s, ...res.stop } : s)
            };
          }
          return exp;
        }));
      }
    } catch (e) {
      console.warn("Spontaneous stop cached offline.");
    }

    return updatedExpedition;
  };

  /**
   * Log an expense
   */
  const logExpense = async (tourId, expenseData) => {
    const targetExp = expeditions.find(e => e.id === tourId);
    if (!targetExp) return;

    const newExpense = {
      id: "exp_" + Date.now(),
      stopId: expenseData.stopId || null,
      category: expenseData.category || "Food",
      amount: Number(expenseData.amount) || 0,
      note: expenseData.note || "General Travel Expense",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedExpenses = [...(targetExp.expenses || []), newExpense];
    const updated = await updateExpedition(tourId, { expenses: updatedExpenses });

    try {
      await api.addTourExpense(tourId, newExpense);
    } catch (e) {}

    return updated;
  };

  /**
   * Finish Expedition & Trigger AI Gamification Evaluation
   */
  const finishExpedition = async (tourId) => {
    const targetExp = expeditions.find(e => e.id === tourId);
    if (!targetExp) return null;

    const stops = targetExp.stops || [];
    const checkedStops = stops.filter(s => s.status === "checked_in");
    const spontaneousStops = stops.filter(s => s.isSpontaneous);
    const expenses = targetExp.expenses || [];
    const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // AI Evaluation Engine Calculations
    const completionRatio = stops.length > 0 ? (checkedStops.length / stops.length) : 1;
    const explorationScore = Math.min(100, Math.round(completionRatio * 95));

    // Budget discipline score (target vs spent)
    const budgetVariance = Math.abs(totalSpent - targetExp.targetBudget) / targetExp.targetBudget;
    const budgetScore = Math.max(60, Math.min(100, Math.round((1 - budgetVariance * 0.5) * 100)));

    // Spontaneous bonus score
    const spontaneousBonusScore = Math.min(100, 70 + spontaneousStops.length * 15);

    // Total points computed
    const totalGamificationPoints = Math.round(150 + explorationScore * 1.2 + budgetScore * 0.8 + spontaneousStops.length * 40);

    // Generate unlocked badges based on tour characteristics
    const earnedBadges = [];
    if (budgetScore >= 85) earnedBadges.push("Budget Maestro");
    if (explorationScore >= 80) earnedBadges.push("Trailblazer");
    if (spontaneousStops.length > 0) earnedBadges.push("Off-the-Beaten-Path Pioneer");
    if (targetExp.destination.toLowerCase().includes("sylhet") || targetExp.destination.toLowerCase().includes("haor")) {
      earnedBadges.push("Haor Navigator");
    } else if (targetExp.destination.toLowerCase().includes("bandarban") || targetExp.destination.toLowerCase().includes("sajek")) {
      earnedBadges.push("Cloud Walker");
    } else {
      earnedBadges.push("Expedition Veteran");
    }

    const aiScoreData = {
      totalPoints: totalGamificationPoints,
      budgetDisciplineScore: budgetScore,
      explorationBonus: explorationScore,
      paceEfficiency: 92,
      spontaneousBonus: spontaneousBonusScore,
      reviewSummary: `Outstanding expedition! Completed ${checkedStops.length} stops (${spontaneousStops.length} spontaneous gems) with ${budgetScore}% budget discipline against the ${Number(targetExp.targetBudget).toLocaleString()} BDT target.`,
      badges: earnedBadges
    };

    const updated = await updateExpedition(tourId, {
      status: "completed",
      spentBudget: totalSpent,
      aiScore: aiScoreData
    });

    if (activeExpeditionId === tourId) {
      setActiveExpeditionId(null);
      localStorage.removeItem("ts_active_expedition_id");
    }

    if (addPoints) {
      addPoints(totalGamificationPoints);
      confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } });
    }

    try {
      await api.endTourPlan(tourId, currentUser?.id || currentUser?.user_id);
    } catch (e) {}

    return { expedition: updated, aiScore: aiScoreData };
  };

  /**
   * One-click publish completed or ongoing expedition to Community Social Feed
   */
  const publishToSocialFeed = async (tourId) => {
    const targetExp = expeditions.find(e => e.id === tourId);
    if (!targetExp) return;

    const checkedStops = (targetExp.stops || []).filter(s => s.status === "checked_in");
    const spontaneousStops = (targetExp.stops || []).filter(s => s.isSpontaneous);
    const totalSpent = (targetExp.expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const captionStory = `🗺️ Live Expedition Story: ${targetExp.title}\n\n` +
      `🚩 From: ${targetExp.startingLocation} ➔ To: ${targetExp.destination}\n` +
      `📅 Season: ${targetExp.season} | Style: ${targetExp.travelType}\n` +
      `📍 Covered ${checkedStops.length} / ${targetExp.stops?.length || 0} stops\n` +
      `💰 Final Budget: ${Number(totalSpent).toLocaleString()} BDT\n` +
      `${spontaneousStops.length > 0 ? `🌟 Discovered ${spontaneousStops.length} hidden gems on the way!\n` : ''}\n` +
      `"${targetExp.description}"`;

    const photos = checkedStops.flatMap(s => s.photos || []).filter(Boolean);
    const postPhotos = photos.length > 0 ? photos : [targetExp.coverImage || "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800"];

    let newPostId = targetExp.socialPostId || "post_exp_" + Date.now();

    if (createPost) {
      const created = await createPost({
        author: targetExp.author || currentUser,
        caption: captionStory,
        images: postPhotos,
        destination: targetExp.destination,
        isPublic: true,
        expeditionData: {
          id: targetExp.id,
          title: targetExp.title,
          status: targetExp.status,
          stopsCount: targetExp.stops?.length || 0,
          checkedCount: checkedStops.length,
          spentBudget: totalSpent,
          targetBudget: targetExp.targetBudget,
          season: targetExp.season,
          travelType: targetExp.travelType
        }
      });
      if (created && created.id) {
        newPostId = created.id;
      }
    }

    const updated = await updateExpedition(tourId, {
      isPublished: true,
      socialPostId: newPostId
    });

    if (addPoints) {
      addPoints(40); // Points for sharing to social feed
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    }

    return updated;
  };

  const value = {
    expeditions,
    activeExpedition,
    activeExpeditionId,
    setActiveExpeditionId,
    isOnline,
    lastSyncTime,
    placesDatabase: BANGLADESH_PLACES_DATABASE,
    companionsDatabase: MOCK_COMPANIONS,
    existingTourGroups: MOCK_EXISTING_TOUR_GROUPS,
    createExpedition,
    updateExpedition,
    deleteExpedition,
    startExpedition,
    restartExpedition,
    checkInStop,
    skipStop,
    addSpontaneousDiscovery,
    logExpense,
    finishExpedition,
    publishToSocialFeed
  };

  return (
    <ExpeditionContext.Provider value={value}>
      {children}
    </ExpeditionContext.Provider>
  );
}

export default ExpeditionContext;
