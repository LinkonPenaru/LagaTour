import React, { useState } from "react";
import { useExpeditions } from "../../context/ExpeditionContext";
import { useAuth } from "../../context/AuthContext";
import ExpeditionMap from "./ExpeditionMap";
import ExpeditionFormModal from "./ExpeditionFormModal";
import ExpeditionSummaryModal from "./ExpeditionSummaryModal";
import { 
  MapPin, 
  CheckCircle, 
  DollarSign, 
  Plus, 
  Sparkles, 
  Navigation, 
  Users, 
  Clock, 
  Car, 
  Home as HomeIcon, 
  AlertTriangle, 
  Check, 
  X, 
  Camera, 
  FileText, 
  Edit3, 
  TrendingUp, 
  Compass, 
  Radio, 
  Wifi, 
  WifiOff,
  Flame,
  ArrowRight,
  Send,
  Trophy,
  RotateCcw
} from "lucide-react";
import confetti from "canvas-confetti";

export default function LiveExpeditionTracker({ expedition, onBack = null, onCreateNew = null }) {
  const { 
    startExpedition,
    checkInStop, 
    skipStop, 
    addSpontaneousDiscovery, 
    logExpense, 
    finishExpedition, 
    restartExpedition,
    isOnline, 
    lastSyncTime 
  } = useExpeditions();
  const { currentUser } = useAuth();

  // Modals
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [checkInStopTarget, setCheckInStopTarget] = useState(null);
  const [checkInNote, setCheckInNote] = useState("");
  const [checkInExpenseAmount, setCheckInExpenseAmount] = useState("");
  const [checkInExpenseCategory, setCheckInExpenseCategory] = useState("Accommodation");
  const [isGpsLoading, setIsGpsLoading] = useState(false);

  // Spontaneous Discovery Modal
  const [isSpontaneousModalOpen, setIsSpontaneousModalOpen] = useState(false);
  const [spontPlaceName, setSpontPlaceName] = useState("");
  const [spontLocation, setSpontLocation] = useState("");
  const [spontTransport, setSpontTransport] = useState("Jeep / Chander Gari");
  const [spontAccommodation, setSpontAccommodation] = useState("Eco Cottage");
  const [spontBadge, setSpontBadge] = useState("Hidden Gem");
  const [spontNotes, setSpontNotes] = useState("");
  const [spontExpense, setSpontExpense] = useState("");
  const [spontInsertAfterId, setSpontInsertAfterId] = useState("");

  // Quick Expense Modal
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expCategory, setExpCategory] = useState("Food");
  const [expAmount, setExpAmount] = useState("");
  const [expNote, setExpNote] = useState("");

  // Skip Stop Modal
  const [isSkipModalOpen, setIsSkipModalOpen] = useState(false);
  const [skipTargetStop, setSkipTargetStop] = useState(null);
  const [skipReason, setSkipReason] = useState("Route adjusted due to weather / time");

  // Edit Plan Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Summary Modal
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [completedAiScore, setCompletedAiScore] = useState(null);

  // Map selected stop
  const [selectedStop, setSelectedStop] = useState(null);

  if (!expedition) {
    return (
      <div className="card bg-base-100 border border-base-300 p-8 md:p-12 rounded-3xl text-center space-y-6 shadow-sm max-w-3xl mx-auto my-4">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
          <Compass className="w-10 h-10 animate-spin" style={{ animationDuration: '20s' }} />
        </div>
        <div className="space-y-2">
          <span className="badge badge-primary badge-sm font-bold uppercase tracking-wider">
            📡 Live Cockpit Standby
          </span>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-base-content m-0">
            No Tour Plan Selected
          </h2>
          <p className="text-sm text-base-content/60 max-w-lg mx-auto leading-relaxed">
            Select a tour plan from the Expeditions tab or click "Start Tour" to manage and track your live itinerary.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
          <div className="p-4 bg-base-200/50 rounded-2xl border border-base-300 space-y-1">
            <span className="text-xl">📍</span>
            <h4 className="font-bold text-xs text-base-content m-0">Live GPS Check-ins</h4>
            <p className="text-[11px] text-base-content/50 m-0">Record real-time coordinates and travel notes per stop.</p>
          </div>
          <div className="p-4 bg-base-200/50 rounded-2xl border border-base-300 space-y-1">
            <span className="text-xl">🌟</span>
            <h4 className="font-bold text-xs text-base-content m-0">Spontaneous Discoveries</h4>
            <p className="text-[11px] text-base-content/50 m-0">Pin unexpected detour spots & hidden gems on the fly.</p>
          </div>
          <div className="p-4 bg-base-200/50 rounded-2xl border border-base-300 space-y-1">
            <span className="text-xl">💰</span>
            <h4 className="font-bold text-xs text-base-content m-0">Live Expense Meter</h4>
            <p className="text-[11px] text-base-content/50 m-0">Log itemized receipts against your target budget.</p>
          </div>
        </div>

        <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
          {onCreateNew && (
            <button 
              onClick={onCreateNew}
              className="btn btn-primary text-primary-content font-black rounded-2xl px-8 shadow-xl shadow-primary/25 gap-2 border-none hover:scale-105 transition-all w-full sm:w-auto"
            >
              <Plus className="w-5 h-5" /> Create a New Expedition Now
            </button>
          )}
          {onBack && (
            <button 
              onClick={onBack}
              className="btn btn-ghost border border-base-300 rounded-2xl font-bold text-xs w-full sm:w-auto"
            >
              View Expeditions List
            </button>
          )}
        </div>
      </div>
    );
  }

  // Normalize stops to ensure all properties exist for robust rendering and mapping
  const stops = (expedition.stops || []).map((s, idx) => ({
    ...s,
    id: s.id || s.tour_plan_place_id || `stop_${idx}`,
    placeName: s.placeName || s.place_name || s.name || s.location || `Stop ${idx + 1}`,
    location: s.location || s.placeName || s.place_name || "",
    lat: Number(s.lat ?? s.latitude ?? 23.8103),
    lng: Number(s.lng ?? s.longitude ?? 90.4125),
    transportMode: s.transportMode || s.transport_mode || "Bus",
    transportCost: Number(s.transportCost || s.transport_cost || 0),
    accommodationType: s.accommodationType || s.accommodation_type || "Hotel",
    accommodationCost: Number(s.accommodationCost || s.accommodation_cost || 0),
    status: s.status || "pending"
  }));
  const checkedStops = stops.filter(s => s.status === "checked_in");
  const spontaneousStops = stops.filter(s => s.isSpontaneous);
  const expenses = expedition.expenses || [];
  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const budgetPercentage = Math.min(100, Math.round((totalSpent / (expedition.targetBudget || 1)) * 100));

  // Current target stop (first non-checked-in, non-skipped stop)
  const currentTargetStop = stops.find(s => s.status === "pending") || null;

  // Open Check-in modal
  const openCheckInModal = (stop) => {
    setCheckInStopTarget(stop);
    setCheckInNote(stop.notes || "");
    setCheckInExpenseAmount(stop.accommodationCost || "");
    setIsCheckInModalOpen(true);
  };

  // Submit Check-in with live GPS coordinates
  const handleConfirmCheckIn = () => {
    if (!checkInStopTarget) return;

    setIsGpsLoading(true);

    const performCheckIn = (gpsCoords) => {
      checkInStop(expedition.id, checkInStopTarget.id, {
        gps: gpsCoords,
        note: checkInNote,
        expense: Number(checkInExpenseAmount) > 0 ? {
          amount: Number(checkInExpenseAmount),
          category: checkInExpenseCategory,
          note: `Stay / Entry at ${checkInStopTarget.placeName}`
        } : null
      });

      setIsGpsLoading(false);
      setIsCheckInModalOpen(false);
      setCheckInStopTarget(null);
    };

    // Try browser geolocation, fallback to stop coordinates if unavailable or denied
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          performCheckIn({
            lat: Number(pos.coords.latitude.toFixed(4)),
            lng: Number(pos.coords.longitude.toFixed(4))
          });
        },
        () => {
          // Fallback simulation to stop coordinates with tiny offset
          performCheckIn({
            lat: checkInStopTarget.lat || 24.3000,
            lng: checkInStopTarget.lng || 91.7000
          });
        },
        { timeout: 4000 }
      );
    } else {
      performCheckIn({
        lat: checkInStopTarget.lat || 24.3000,
        lng: checkInStopTarget.lng || 91.7000
      });
    }
  };

  // Quick Expense Submit
  const handleLogExpenseSubmit = (e) => {
    e.preventDefault();
    if (!expAmount || Number(expAmount) <= 0) return;

    logExpense(expedition.id, {
      category: expCategory,
      amount: Number(expAmount),
      note: expNote || "Expedition Expense"
    });

    setExpAmount("");
    setExpNote("");
    setIsExpenseModalOpen(false);
  };

  // Spontaneous Discovery Submit
  const handleSpontaneousSubmit = (e) => {
    e.preventDefault();
    if (!spontPlaceName.trim()) return;

    const lastChecked = [...stops].reverse().find(s => s.status === 'checked_in') || stops[0];
    const targetRefId = spontInsertAfterId || lastChecked?.id;
    const targetRefStop = stops.find(s => s.id === targetRefId);

    addSpontaneousDiscovery(expedition.id, {
      placeName: spontPlaceName,
      location: spontLocation,
      insertAfterStopId: targetRefId,
      insertAfterOrder: targetRefStop?.order,
      transportMode: spontTransport,
      accommodationType: spontAccommodation,
      badge: spontBadge,
      notes: spontNotes,
      expense: Number(spontExpense) > 0 ? {
        amount: Number(spontExpense),
        category: "Activities"
      } : null
    });

    setSpontPlaceName("");
    setSpontLocation("");
    setSpontNotes("");
    setSpontExpense("");
    setSpontInsertAfterId("");
    setIsSpontaneousModalOpen(false);
  };

  // Skip Stop Submit
  const handleConfirmSkip = () => {
    if (!skipTargetStop) return;
    skipStop(expedition.id, skipTargetStop.id, skipReason);
    setIsSkipModalOpen(false);
    setSkipTargetStop(null);
  };

  // Finish Tour action
  const handleFinishTour = () => {
    if (confirm("Are you ready to conclude this expedition and generate your AI Gamification score?")) {
      const result = finishExpedition(expedition.id);
      if (result) {
        setCompletedAiScore(result.aiScore);
        setIsSummaryModalOpen(true);
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Expedition Status Bar */}
      <div className="card bg-base-100 border border-base-300 p-4 md:p-6 shadow-md rounded-3xl">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {expedition.status === "completed" ? (
                <span className="badge badge-success gap-1.5 font-black text-white px-3 py-1.5 shadow-sm">
                  <Trophy className="w-3.5 h-3.5" /> COMPLETED EXPEDITION
                </span>
              ) : (
                <span className="badge badge-error gap-1.5 font-black text-white px-3 py-1.5 shadow-sm animate-pulse">
                  <Radio className="w-3.5 h-3.5" /> ONGOING EXPEDITION
                </span>
              )}
              <span className="badge badge-outline text-xs font-bold">
                {expedition.travelType} | {expedition.season} Season
              </span>
              {isOnline ? (
                <span className="text-[11px] text-emerald-500 font-bold flex items-center gap-1">
                  <Wifi className="w-3.5 h-3.5" /> Live Synced ({lastSyncTime})
                </span>
              ) : (
                <span className="text-[11px] text-warning font-bold flex items-center gap-1 bg-warning/10 px-2 py-0.5 rounded-md">
                  <WifiOff className="w-3.5 h-3.5" /> Offline Mode (Cached Locally)
                </span>
              )}
            </div>

            <h2 className="text-xl md:text-2xl font-black tracking-tight m-0 text-base-content">
              {expedition.title}
            </h2>
            <p className="text-xs text-base-content/60 flex items-center gap-1">
              <span>Origin: <b>{expedition.startingLocation}</b></span>
              <ArrowRight className="w-3 h-3 text-primary inline" />
              <span>Destination: <b>{expedition.destination}</b></span>
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            
            {expedition.status === "ongoing" ? (
              <>
                <button 
                  onClick={() => setIsSpontaneousModalOpen(true)}
                  className="btn btn-sm btn-warning text-slate-900 font-black rounded-xl gap-1.5 shadow-md hover:scale-105 transition-transform"
                >
                  <Sparkles className="w-4 h-4" /> + Log Spontaneous Discovery
                </button>

                <button 
                  onClick={() => setIsEditModalOpen(true)}
                  className="btn btn-sm btn-ghost border border-base-300 rounded-xl gap-1.5 font-bold text-xs"
                  title="Edit Tour Plan"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Modify Plan
                </button>

                <button 
                  onClick={handleFinishTour}
                  className="btn btn-sm btn-primary text-primary-content font-black rounded-xl gap-1.5 shadow-lg shadow-primary/20"
                >
                  <Trophy className="w-4 h-4" /> End Expedition
                </button>
              </>
            ) : expedition.status === "planned" ? (
              <>
                <button 
                  onClick={() => startExpedition(expedition.id)}
                  className="btn btn-sm btn-primary text-primary-content font-black rounded-xl gap-1.5 shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                >
                  <Navigation className="w-3.5 h-3.5" /> Start Expedition Now
                </button>

                <button 
                  onClick={() => setIsEditModalOpen(true)}
                  className="btn btn-sm btn-ghost border border-base-300 rounded-xl gap-1.5 font-bold text-xs"
                  title="Edit Tour Plan"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Modify Plan
                </button>

                {onCreateNew && (
                  <button 
                    onClick={onCreateNew}
                    className="btn btn-sm btn-ghost border border-base-300 rounded-xl gap-1.5 font-bold text-xs"
                  >
                    <Plus className="w-4 h-4" /> Plan New
                  </button>
                )}
              </>
            ) : (
              <>
                {expedition.aiScore && (
                  <button 
                    onClick={() => {
                      setCompletedAiScore(expedition.aiScore);
                      setIsSummaryModalOpen(true);
                    }}
                    className="btn btn-sm btn-ghost border border-base-300 rounded-xl gap-1.5 font-bold text-xs"
                  >
                    <Trophy className="w-3.5 h-3.5 text-warning" /> View AI Scorecard
                  </button>
                )}

                <button 
                  onClick={() => {
                    if (window.confirm("Restart this expedition? All stops and check-ins will reset to start a fresh live journey.")) {
                      restartExpedition(expedition.id);
                    }
                  }}
                  className="btn btn-sm btn-primary text-primary-content font-black rounded-xl gap-1.5 shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restart Expedition
                </button>

                {onCreateNew && (
                  <button 
                    onClick={onCreateNew}
                    className="btn btn-sm btn-ghost border border-base-300 rounded-xl gap-1.5 font-bold text-xs"
                  >
                    <Plus className="w-4 h-4" /> Plan New
                  </button>
                )}
              </>
            )}

            {onBack && (
              <button onClick={onBack} className="btn btn-sm btn-circle btn-ghost">
                <X className="w-4 h-4" />
              </button>
            )}

          </div>

        </div>
      </div>

      {/* Main Grid: Interactive Map & Live Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Interactive Leaflet Map & Live Expense Meter (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Interactive Leaflet Expedition Map */}
          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-black uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-primary" /> Live GPS Route & Stops Map
              </span>
              <span className="text-[11px] text-base-content/50">
                {checkedStops.length} of {stops.length} stops reached
              </span>
            </div>

            <ExpeditionMap 
              stops={stops}
              currentGps={expedition.currentGps}
              selectedStop={selectedStop}
              onStopSelect={(s) => setSelectedStop(s)}
              height="380px"
            />
          </div>

          {/* Live Expense Meter & Itemized Tracker */}
          <div className="card bg-base-100 border border-base-300 p-5 rounded-3xl space-y-4 shadow-sm">
            
            <div className="flex justify-between items-center border-b border-base-200 pb-3">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" /> Live Expense Meter
                </span>
                <span className="text-[11px] text-base-content/60">Real-time budget tracking vs target allowance</span>
              </div>

              <button 
                onClick={() => setIsExpenseModalOpen(true)}
                className="btn btn-xs btn-primary text-primary-content font-bold rounded-lg gap-1"
              >
                <Plus className="w-3 h-3" /> Log Expense
              </button>
            </div>

            {/* Budget Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-base-content/70">
                  Spent: <b className="text-base-content">{Number(totalSpent).toLocaleString()} BDT</b>
                </span>
                <span className="text-base-content/70">
                  Target: <b>{Number(expedition.targetBudget).toLocaleString()} BDT</b>
                </span>
              </div>

              <div className="w-full bg-base-200 rounded-full h-3 overflow-hidden border border-base-300">
                <div 
                  className={`h-full transition-all duration-500 rounded-full ${
                    budgetPercentage > 95 ? 'bg-error' : budgetPercentage > 75 ? 'bg-warning' : 'bg-primary'
                  }`}
                  style={{ width: `${budgetPercentage}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-base-content/50">
                <span>{budgetPercentage}% Budget Consumed</span>
                <span>Remaining: {Math.max(0, expedition.targetBudget - totalSpent).toLocaleString()} BDT</span>
              </div>
            </div>

            {/* Recent Expenses List */}
            {expenses.length > 0 && (
              <div className="pt-2 border-t border-base-200 space-y-2">
                <span className="text-[10px] font-bold uppercase text-base-content/50 block">Recent Itemized Logs:</span>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {expenses.map((exp, idx) => (
                    <div key={exp.id || idx} className="flex justify-between items-center bg-base-200/50 p-2 rounded-xl text-xs border border-base-200">
                      <div className="flex items-center gap-2">
                        <span className="badge badge-xs badge-neutral font-bold">{exp.category}</span>
                        <span className="font-semibold text-base-content truncate max-w-[180px]">{exp.note}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-primary">{Number(exp.amount).toLocaleString()} BDT</span>
                        <span className="text-[10px] text-base-content/40">{exp.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Invited Companions Live Status */}
          <div className="card bg-base-100 border border-base-300 p-5 rounded-3xl shadow-sm space-y-3">
            <span className="text-xs font-black uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-primary" /> Live Companion Radar ({expedition.companions?.length || 0})
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(expedition.companions || []).map((comp, idx) => (
                <div key={comp.id || idx} className="flex items-center gap-2.5 p-2 bg-base-200/40 rounded-2xl border border-base-300">
                  <div className="relative">
                    <img src={comp.avatar} alt={comp.name} className="w-9 h-9 rounded-full object-cover border border-base-300" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 absolute bottom-0 right-0 border-2 border-base-100"></span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate m-0 text-base-content">{comp.name}</p>
                    <p className="text-[10px] text-base-content/50 truncate m-0">{comp.role || 'Companion'} • {comp.league}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Live Stops Timeline & Check-in Cockpit (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          <div className="card bg-base-100 border border-base-300 p-5 rounded-3xl shadow-sm space-y-4">
            
            <div className="flex justify-between items-center border-b border-base-200 pb-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-base-content flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-primary" /> Live Check-in Timeline
                </h3>
                <span className="text-[11px] text-base-content/50">Sequenced dynamically by your live check-in timeline</span>
              </div>
              <span className="badge badge-sm badge-neutral font-bold">{stops.length} Total Stops</span>
            </div>

            {/* Stepper Timeline */}
            <div className="space-y-4 max-h-[640px] overflow-y-auto pr-1">
              {stops.length === 0 ? (
                <div className="p-8 text-center bg-base-200/40 rounded-2xl border border-dashed border-base-300 space-y-3">
                  <MapPin className="w-8 h-8 text-base-content/30 mx-auto" />
                  <p className="text-xs font-bold text-base-content/70 m-0">No stops scheduled in itinerary</p>
                  <p className="text-[11px] text-base-content/50 m-0">Click Modify Plan to add places and scenic destinations to this tour route.</p>
                  <button 
                    onClick={() => setIsEditModalOpen(true)}
                    className="btn btn-xs btn-primary text-primary-content font-bold rounded-lg"
                  >
                    + Add Stops to Tour
                  </button>
                </div>
              ) : (
                stops.map((stop, idx) => {
                  const isChecked = stop.status === "checked_in";
                  const isSkipped = stop.status === "skipped";
                  const isCurrent = currentTargetStop && currentTargetStop.id === stop.id;

                return (
                  <div 
                    key={stop.id || idx} 
                    onClick={() => setSelectedStop(stop)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                      stop.isSpontaneous 
                        ? 'bg-amber-500/10 border-amber-500/40 shadow-sm' 
                        : isChecked 
                        ? 'bg-emerald-500/5 border-emerald-500/30' 
                        : isCurrent
                        ? 'bg-primary/5 border-primary shadow-md ring-1 ring-primary/30'
                        : isSkipped
                        ? 'bg-base-200/40 border-base-300 opacity-60'
                        : 'bg-base-100 border-base-300'
                    }`}
                  >
                    {/* Header line */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs ${
                          stop.isSpontaneous
                            ? 'bg-amber-500 text-white shadow'
                            : isChecked
                            ? 'bg-emerald-500 text-white shadow'
                            : isCurrent
                            ? 'bg-primary text-primary-content shadow animate-pulse'
                            : isSkipped
                            ? 'bg-base-content/20 text-base-content'
                            : 'bg-base-200 text-base-content/70'
                        }`}>
                          {stop.isSpontaneous ? '🌟' : isChecked ? '✓' : isSkipped ? '✕' : idx + 1}
                        </span>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black uppercase text-base-content/40 tracking-wider">
                              Stop {idx + 1}
                            </span>
                            {isChecked && (
                              <span className="badge badge-xs badge-success text-[9px] text-white font-extrabold py-0 px-1">
                                Visited #{idx + 1}
                              </span>
                            )}
                          </div>
                          <h4 className="font-black text-xs text-base-content leading-tight m-0">
                            {stop.placeName}
                          </h4>
                          <span className="text-[10px] text-base-content/50 block mt-0.5">
                            📍 {stop.location || 'Bangladesh'}
                          </span>
                        </div>
                      </div>

                      {/* Status badge */}
                      {stop.isSpontaneous ? (
                        <span className="badge badge-warning badge-xs font-bold">Spontaneous Gem</span>
                      ) : isChecked ? (
                        <span className="badge badge-success badge-xs text-white font-bold">Checked In</span>
                      ) : isSkipped ? (
                        <span className="badge badge-ghost badge-xs font-bold text-base-content/50">Skipped</span>
                      ) : isCurrent ? (
                        <span className="badge badge-primary badge-xs text-primary-content font-bold">Next Stop</span>
                      ) : (
                        <span className="badge badge-ghost badge-xs text-[10px]">Upcoming</span>
                      )}
                    </div>

                    {/* Meta info chips */}
                    <div className="grid grid-cols-2 gap-2 my-2.5 text-[11px] bg-base-200/60 p-2.5 rounded-xl border border-base-200">
                      <div className="flex items-center gap-1.5 truncate">
                        <Car className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="truncate font-semibold">{stop.transportMode} ({stop.transportCost || 0} BDT)</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <HomeIcon className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                        <span className="truncate font-semibold">{stop.accommodationType} ({stop.accommodationCost || 0} BDT)</span>
                      </div>
                    </div>

                    {/* Check-in notes or planned notes */}
                    {stop.checkInNote ? (
                      <p className="text-[11px] text-base-content/85 italic bg-base-100 p-2 rounded-lg border border-base-200 m-0">
                        "{stop.checkInNote}"
                      </p>
                    ) : stop.notes ? (
                      <p className="text-[11px] text-base-content/60 m-0 line-clamp-2">
                        {stop.notes}
                      </p>
                    ) : null}

                    {/* Check-in action buttons if not yet checked in */}
                    {!isChecked && !isSkipped && (
                      <div className="flex items-center gap-2 pt-3 border-t border-base-200 mt-2.5">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openCheckInModal(stop);
                          }}
                          className="btn btn-xs btn-primary text-primary-content font-black rounded-lg flex-1 gap-1"
                        >
                          <Navigation className="w-3 h-3" /> Live GPS Check-in
                        </button>

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSkipTargetStop(stop);
                            setIsSkipModalOpen(true);
                          }}
                          className="btn btn-xs btn-ghost text-base-content/50 hover:text-error rounded-lg"
                        >
                          Skip
                        </button>
                      </div>
                    )}

                    {isChecked && stop.checkInTime && (
                      <div className="text-[10px] text-emerald-600 font-bold mt-2 flex items-center justify-between">
                        <span>✓ GPS Verified</span>
                        <span>{new Date(stop.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    )}

                  </div>
                );
              })
            )}
            </div>

          </div>

        </div>

      </div>

      {/* Check-in Modal */}
      {isCheckInModalOpen && checkInStopTarget && (
        <div className="modal modal-open z-[999]">
          <div className="modal-box max-w-md rounded-3xl p-6 border border-base-300 bg-base-100 shadow-2xl">
            <div className="flex justify-between items-center border-b border-base-300 pb-3 mb-4">
              <h3 className="text-base font-black m-0 flex items-center gap-2">
                <Navigation className="w-5 h-5 text-primary" /> Check-in at Stop
              </h3>
              <button onClick={() => setIsCheckInModalOpen(false)} className="btn btn-sm btn-circle btn-ghost">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-base-200/50 p-3 rounded-2xl border border-base-300">
                <span className="text-[10px] font-bold text-base-content/60 block">Stop Destination:</span>
                <span className="font-black text-sm text-base-content">{checkInStopTarget.placeName}</span>
                <span className="text-[11px] text-base-content/60 block mt-0.5">{checkInStopTarget.location}</span>
              </div>

              <div className="form-control">
                <label className="label py-0.5"><span className="label-text text-xs font-bold">Check-in Notes & Experience</span></label>
                <textarea 
                  rows="2"
                  placeholder="How was the journey? Weather, sights, or road conditions..." 
                  className="textarea textarea-bordered w-full rounded-xl text-xs"
                  value={checkInNote}
                  onChange={(e) => setCheckInNote(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="form-control">
                  <label className="label py-0.5"><span className="label-text text-xs font-bold">Log Stay/Entry Expense</span></label>
                  <input 
                    type="number" 
                    placeholder="BDT amount"
                    className="input input-sm input-bordered w-full rounded-xl text-xs"
                    value={checkInExpenseAmount}
                    onChange={(e) => setCheckInExpenseAmount(e.target.value)}
                  />
                </div>

                <div className="form-control">
                  <label className="label py-0.5"><span className="label-text text-xs font-bold">Category</span></label>
                  <select 
                    className="select select-sm select-bordered w-full rounded-xl text-xs"
                    value={checkInExpenseCategory}
                    onChange={(e) => setCheckInExpenseCategory(e.target.value)}
                  >
                    <option value="Accommodation">Accommodation</option>
                    <option value="Transport">Transport</option>
                    <option value="Food">Food</option>
                    <option value="Activities">Activities</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 flex items-center gap-2">
                <Radio className="w-4 h-4 text-primary animate-pulse shrink-0" />
                <span className="text-[11px] text-base-content/80">
                  Will record live GPS latitude & longitude and notify companions in real-time.
                </span>
              </div>
            </div>

            <div className="modal-action border-t border-base-300 pt-3">
              <button 
                type="button" 
                onClick={() => setIsCheckInModalOpen(false)} 
                className="btn btn-sm btn-ghost rounded-xl text-xs"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleConfirmCheckIn}
                disabled={isGpsLoading}
                className="btn btn-sm btn-primary text-primary-content font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md"
              >
                {isGpsLoading ? "Acquiring GPS..." : "Confirm & Check In"} <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spontaneous Discovery Modal */}
      {isSpontaneousModalOpen && (
        <div className="modal modal-open z-[999]">
          <div className="modal-box max-w-md rounded-3xl p-6 border border-base-300 bg-base-100 shadow-2xl">
            <div className="flex justify-between items-center border-b border-base-300 pb-3 mb-4">
              <h3 className="text-base font-black m-0 flex items-center gap-2 text-amber-500">
                <Sparkles className="w-5 h-5" /> Log Spontaneous Discovery
              </h3>
              <button onClick={() => setIsSpontaneousModalOpen(false)} className="btn btn-sm btn-circle btn-ghost">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSpontaneousSubmit} className="space-y-3 text-xs">
              {/* Route Position Selector */}
              <div className="form-control bg-amber-500/10 p-2.5 rounded-2xl border border-amber-500/20 space-y-1">
                <label className="label py-0">
                  <span className="label-text text-[11px] font-black text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <Navigation className="w-3.5 h-3.5" /> Detour Route Position (Insert After)
                  </span>
                </label>
                <select 
                  className="select select-xs select-bordered w-full rounded-xl font-bold bg-base-100 text-xs"
                  value={spontInsertAfterId || ([...stops].reverse().find(s => s.status === 'checked_in')?.id) || stops[0]?.id || ""}
                  onChange={(e) => setSpontInsertAfterId(e.target.value)}
                >
                  {stops.map((s, idx) => (
                    <option key={s.id} value={s.id}>
                      Stop {idx + 1}: {s.placeName} {s.status === 'checked_in' ? '✓ (Completed)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-base-content/60 m-0 px-1">
                  ✨ The spontaneous stop will be inserted right after this spot, and subsequent itinerary stops will shift forward (+1).
                </p>
              </div>

              <div className="form-control">
                <label className="label py-0.5"><span className="label-text text-xs font-bold">Discovery Spot Name</span></label>
                <input 
                  type="text" 
                  placeholder="e.g. Hidden Lotus Lake or Secret Water Gorge"
                  className="input input-sm input-bordered w-full rounded-xl text-xs"
                  value={spontPlaceName}
                  onChange={(e) => setSpontPlaceName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="form-control">
                  <label className="label py-0.5"><span className="label-text text-xs font-bold">Region / Road</span></label>
                  <input 
                    type="text" 
                    placeholder="e.g. Near Tea Garden Trail"
                    className="input input-sm input-bordered w-full rounded-xl text-xs"
                    value={spontLocation}
                    onChange={(e) => setSpontLocation(e.target.value)}
                  />
                </div>

                <div className="form-control">
                  <label className="label py-0.5"><span className="label-text text-xs font-bold">Custom Badge</span></label>
                  <input 
                    type="text" 
                    placeholder="e.g. Hidden Gem"
                    className="input input-sm input-bordered w-full rounded-xl text-xs"
                    value={spontBadge}
                    onChange={(e) => setSpontBadge(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-control">
                <label className="label py-0.5"><span className="label-text text-xs font-bold">Discovery Notes</span></label>
                <textarea 
                  rows="2"
                  placeholder="What made this place special? Who recommended it?"
                  className="textarea textarea-bordered w-full rounded-xl text-xs"
                  value={spontNotes}
                  onChange={(e) => setSpontNotes(e.target.value)}
                />
              </div>

              <div className="form-control">
                <label className="label py-0.5"><span className="label-text text-xs font-bold">Optional Detour Cost (BDT)</span></label>
                <input 
                  type="number" 
                  placeholder="e.g. 500"
                  className="input input-sm input-bordered w-full rounded-xl text-xs"
                  value={spontExpense}
                  onChange={(e) => setSpontExpense(e.target.value)}
                />
              </div>

              <div className="modal-action border-t border-base-300 pt-3">
                <button type="button" onClick={() => setIsSpontaneousModalOpen(false)} className="btn btn-sm btn-ghost rounded-xl text-xs">Cancel</button>
                <button type="submit" className="btn btn-sm btn-warning text-slate-900 font-black rounded-xl text-xs flex items-center gap-1 shadow-md">
                  <Sparkles className="w-3.5 h-3.5" /> Save Discovery Pin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Expense Modal */}
      {isExpenseModalOpen && (
        <div className="modal modal-open z-[999]">
          <div className="modal-box max-w-sm rounded-3xl p-6 border border-base-300 bg-base-100 shadow-2xl">
            <div className="flex justify-between items-center border-b border-base-300 pb-3 mb-4">
              <h3 className="text-base font-black m-0 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" /> Log Travel Expense
              </h3>
              <button onClick={() => setIsExpenseModalOpen(false)} className="btn btn-sm btn-circle btn-ghost">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLogExpenseSubmit} className="space-y-3 text-xs">
              <div className="form-control">
                <label className="label py-0.5"><span className="label-text text-xs font-bold">Expense Amount (BDT)</span></label>
                <input 
                  type="number" 
                  placeholder="e.g. 1200"
                  className="input input-sm input-bordered w-full rounded-xl text-xs"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-control">
                <label className="label py-0.5"><span className="label-text text-xs font-bold">Category</span></label>
                <select 
                  className="select select-sm select-bordered w-full rounded-xl text-xs"
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                >
                  <option value="Food">Food & Drinks</option>
                  <option value="Transport">Transport & Fuel</option>
                  <option value="Accommodation">Accommodation</option>
                  <option value="Activities">Tickets & Activities</option>
                  <option value="Misc">Emergency & Misc</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label py-0.5"><span className="label-text text-xs font-bold">Note / Description</span></label>
                <input 
                  type="text" 
                  placeholder="e.g. Lunch at Panshi restaurant"
                  className="input input-sm input-bordered w-full rounded-xl text-xs"
                  value={expNote}
                  onChange={(e) => setExpNote(e.target.value)}
                />
              </div>

              <div className="modal-action border-t border-base-300 pt-3">
                <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="btn btn-sm btn-ghost rounded-xl text-xs">Cancel</button>
                <button type="submit" className="btn btn-sm btn-primary text-primary-content font-bold rounded-xl text-xs">
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Skip Stop Modal */}
      {isSkipModalOpen && skipTargetStop && (
        <div className="modal modal-open z-[999]">
          <div className="modal-box max-w-sm rounded-3xl p-6 border border-base-300 bg-base-100 shadow-2xl">
            <h3 className="text-sm font-black m-0 text-error">Skip Stop: {skipTargetStop.placeName}?</h3>
            <p className="text-xs text-base-content/60 my-2">
              Marking this stop as skipped will update your route and companion trackers.
            </p>

            <div className="form-control mb-4">
              <label className="label py-0.5"><span className="label-text text-xs font-bold">Reason for Skipping</span></label>
              <input 
                type="text" 
                className="input input-sm input-bordered w-full rounded-xl text-xs"
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
              />
            </div>

            <div className="modal-action">
              <button type="button" onClick={() => setIsSkipModalOpen(false)} className="btn btn-sm btn-ghost rounded-xl text-xs">Cancel</button>
              <button type="button" onClick={handleConfirmSkip} className="btn btn-sm btn-error text-white font-bold rounded-xl text-xs">
                Confirm Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Plan Modal */}
      {isEditModalOpen && (
        <ExpeditionFormModal 
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          initialData={expedition}
        />
      )}

      {/* Post-Expedition Summary Modal */}
      {isSummaryModalOpen && (
        <ExpeditionSummaryModal 
          isOpen={isSummaryModalOpen}
          onClose={() => setIsSummaryModalOpen(false)}
          expedition={expedition}
          aiScoreData={completedAiScore}
        />
      )}

    </div>
  );
}
