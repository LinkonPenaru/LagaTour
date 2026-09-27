import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useExpeditions } from "../context/ExpeditionContext";
import { api } from "../services/api";
import { 
  Sparkles, 
  MapPin, 
  DollarSign, 
  Clock, 
  Compass, 
  ArrowRight,
  Loader2, 
  Calendar, 
  Layers, 
  Heart, 
  FileCheck,
  Globe,
  Database,
  Sun,
  Sunrise,
  Moon,
  Utensils,
  ShieldCheck,
  CheckCircle2,
  Bus,
  Check,
  ExternalLink,
  ChevronRight,
  Luggage,
  Info
} from "lucide-react";
import confetti from "canvas-confetti";

const POPULAR_DESTINATIONS = [
  "Cox's Bazar",
  "Sajek Valley",
  "Sreemangal",
  "Saint Martin's Island",
  "Bandarban",
  "Sundarbans",
  "Tanguar Haor",
  "Kuakata",
  "Sylhet",
  "Rangamati"
];

const STARTING_CITIES = [
  "Dhaka",
  "Chattogram",
  "Sylhet",
  "Rajshahi",
  "Khulna",
  "Barisal",
  "Rangpur",
  "Mymensingh",
  "Cumilla"
];

export default function AIBuilder() {
  const { currentUser, addPoints } = useAuth();
  const { createExpedition } = useExpeditions();
  const navigate = useNavigate();

  // Form Inputs
  const [startingLocation, setStartingLocation] = useState("Dhaka");
  const [destination, setDestination] = useState("Cox's Bazar");
  const [budget, setBudget] = useState(15000);
  const [duration, setDuration] = useState(3);
  const [style, setStyle] = useState("Adventure");
  const [transportation, setTransportation] = useState("AC Bus");

  // Generator States
  const [isLoading, setIsLoading] = useState(false);
  const [stepMessage, setStepMessage] = useState("");
  const [dualPackages, setDualPackages] = useState(null);
  const [activeTab, setActiveTab] = useState("database"); // 'database' | 'web'
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessId, setSaveSuccessId] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});

  // Handle AI Package Generation
  const handleGenerate = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setDualPackages(null);
    setSaveSuccessId(null);
    setCheckedItems({});

    setStepMessage("Grounding with LagaTour tourist spots & safety database...");

    try {
      // Dynamic progress messaging
      const timer1 = setTimeout(() => {
        setStepMessage("Consulting Google Gemini AI Engine for dual suggestions...");
      }, 1200);

      const timer2 = setTimeout(() => {
        setStepMessage("Synthesizing day-by-day time slots, expenses & travel tips...");
      }, 3500);

      const response = await api.buildAITourPackage({
        startingLocation,
        destination,
        duration: parseInt(duration, 10),
        budget: parseInt(budget, 10),
        travelStyle: style,
        transportation
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      if (response && response.success) {
        setDualPackages({
          database: response.databaseSuggestion,
          web: response.webSuggestion
        });
        setActiveTab("database");
        addPoints(50); // reward points for using AI planner
      } else {
        throw new Error(response?.message || "Failed to generate packages");
      }
    } catch (err) {
      console.error("AI Generation error:", err);
      alert("Notice: " + (err.message || "Could not generate package. Please try again."));
    } finally {
      setIsLoading(false);
      setStepMessage("");
    }
  };

  // The package currently selected for inspection
  const currentPackage = dualPackages ? dualPackages[activeTab] : null;

  // Intelligently extract ALL places visited across Morning, Afternoon, and Evening of every day
  const comprehensiveStops = React.useMemo(() => {
    if (!currentPackage) return [];

    const allSpots = [];
    const days = currentPackage.days || [];
    const dest = currentPackage.destination || destination || "Destination";
    const totalDays = currentPackage.durationDays || days.length || 3;
    const totalBudget = Number(currentPackage.totalBudget || budget) || 15000;
    const defaultTransport = currentPackage.transportation || transportation || "Bus";
    
    // Proportional transport & stay estimates
    const totalTransportCost = Math.round(totalBudget * 0.28);
    const totalAccomCost = Math.round(totalBudget * 0.38);

    const timeSlots = [
      { key: "morning", label: "Morning", defaultTime: "08:00 AM - 12:00 PM" },
      { key: "afternoon", label: "Afternoon", defaultTime: "01:00 PM - 05:00 PM" },
      { key: "evening", label: "Evening", defaultTime: "05:30 PM - 09:30 PM" }
    ];

    days.forEach((d, dayIdx) => {
      timeSlots.forEach((slotInfo) => {
        const slotData = d[slotInfo.key];
        if (slotData && slotData.spot && slotData.spot.trim()) {
          allSpots.push({
            dayNumber: d.day || (dayIdx + 1),
            dayTheme: d.theme || `Day ${d.day || (dayIdx + 1)}`,
            slotLabel: slotInfo.label,
            spot: slotData.spot.trim(),
            time: slotData.time || slotInfo.defaultTime,
            activity: slotData.activity || `Explore ${slotData.spot}`,
            foodTip: slotData.foodTip || ""
          });
        }
      });
    });

    // If day slots were empty, fall back to existing currentPackage.stops
    if (allSpots.length === 0 && Array.isArray(currentPackage.stops) && currentPackage.stops.length > 0) {
      return currentPackage.stops.map((s, idx) => ({
        ...s,
        order: idx + 1,
        id: s.id || `stop_ai_${Date.now()}_${idx}`
      }));
    }

    // Deduplicate consecutive identical spots
    const deduplicatedSpots = [];
    allSpots.forEach(s => {
      if (deduplicatedSpots.length === 0 || deduplicatedSpots[deduplicatedSpots.length - 1].spot.toLowerCase() !== s.spot.toLowerCase()) {
        deduplicatedSpots.push(s);
      }
    });

    const stopCount = Math.max(1, deduplicatedSpots.length);
    const transportPerStop = Math.round(totalTransportCost / stopCount);
    const stayCount = Math.max(1, totalDays - 1);
    const accomPerStay = Math.round(totalAccomCost / stayCount);

    // Map existing known stops by name for coordinates & photos
    const knownStopsMap = new Map();
    (currentPackage.stops || []).forEach(s => {
      if (s.placeName) knownStopsMap.set(s.placeName.toLowerCase().trim(), s);
    });

    return deduplicatedSpots.map((item, idx) => {
      const isEvening = item.slotLabel === "Evening";
      const isLastDay = item.dayNumber === totalDays;
      const hasAccommodation = isEvening && !isLastDay;
      const matched = knownStopsMap.get(item.spot.toLowerCase().trim());

      // Base coordinates centered on destination or known matched coordinates
      const baseLat = matched?.lat || 21.4272;
      const baseLng = matched?.lng || 92.0058;
      // Slight spread so individual pins don't overlap on map
      const latOffset = ((idx % 5) - 2) * 0.018;
      const lngOffset = ((idx % 4) - 1.5) * 0.018;

      return {
        id: `stop_ai_${Date.now()}_${idx}`,
        order: idx + 1,
        placeName: item.spot,
        location: `${item.spot}, ${dest}`,
        lat: Number(matched?.lat || (baseLat + latOffset)),
        lng: Number(matched?.lng || (baseLng + lngOffset)),
        transportMode: idx === 0 ? defaultTransport : (isEvening ? "Local Transit / Walk" : "Local Sightseeing Auto / Jeep"),
        transportDetails: `[Day ${item.dayNumber} ${item.slotLabel}] ${item.activity}`,
        transportCost: transportPerStop,
        hasAccommodation: hasAccommodation,
        accommodationType: hasAccommodation ? (currentPackage.accommodationType || "Hotel") : "None (Day Visit)",
        accommodationName: hasAccommodation ? (matched?.accommodationName || currentPackage.accommodationType || "Scenic Hotel / Resort") : "",
        accommodationCost: hasAccommodation ? accomPerStay : 0,
        accommodationDetails: hasAccommodation ? `Overnight stay for Day ${item.dayNumber}` : "Day tour spot",
        stayDuration: hasAccommodation ? "1 Night" : "",
        notes: `[Day ${item.dayNumber} • ${item.slotLabel}] ${item.activity}${item.foodTip ? ` • 🍴 ${item.foodTip}` : ''}`,
        status: "pending",
        photos: [currentPackage.coverImage || "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800"],
        safetyRating: matched?.safetyRating || 4.8,
        expense: transportPerStop + (hasAccommodation ? accomPerStay : 0)
      };
    });
  }, [currentPackage, destination, budget, transportation]);

  // Real Save to Tour Plans & MySQL
  const handleSaveToMyPlans = async () => {
    if (!currentPackage || isSaving) return;

    setIsSaving(true);
    try {
      const today = new Date();
      const end = new Date(today);
      end.setDate(today.getDate() + (currentPackage.durationDays || 3));

      // Use comprehensiveStops so EVERY single place visited is recorded in the expedition
      const stopsToSave = comprehensiveStops.length > 0 ? comprehensiveStops : (currentPackage.stops || []);

      const planPayload = {
        title: currentPackage.title,
        description: `${currentPackage.tagline}\n\nAI Recommendations & Advice:\n${(currentPackage.tips || []).map(t => `• ${t}`).join('\n')}`,
        startingLocation: currentPackage.startingLocation || startingLocation,
        destination: currentPackage.destination || destination,
        startDate: today.toISOString().split("T")[0],
        endDate: end.toISOString().split("T")[0],
        targetBudget: Number(currentPackage.totalBudget || budget),
        travelType: currentPackage.travelType || style,
        season: "Winter",
        transportation: currentPackage.transportation || transportation,
        coverImage: currentPackage.coverImage || "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
        author: currentUser || { id: "user_anon", name: "LagaTour Traveler" },
        stops: stopsToSave,
        status: "planned"
      };

      // Call context createExpedition (optimistically updates React state + syncs to MySQL)
      let savedPlan;
      if (createExpedition) {
        savedPlan = await createExpedition(planPayload);
      } else {
        savedPlan = await api.createTourPlan(planPayload);
      }

      addPoints(100);
      confetti({
        particleCount: 160,
        spread: 80,
        origin: { y: 0.6 }
      });

      setSaveSuccessId(savedPlan?.id || savedPlan?.tourPlanId || "saved");
    } catch (err) {
      console.error("Save plan error:", err);
      alert("Failed to save tour plan: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleChecklist = (idx) => {
    setCheckedItems(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 max-w-5xl space-y-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-base-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="badge badge-primary badge-sm font-bold gap-1 py-1">
              <Sparkles className="w-3.5 h-3.5 fill-current" /> Powered by Google Gemini AI
            </span>
            <span className="badge badge-outline badge-sm text-xs font-semibold">
              Dual Suggestion Engine
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2.5">
            AI Tour Package Builder
          </h1>
          <p className="text-sm text-base-content/70 mt-1">
            Build intelligent, granular travel packages with simultaneous suggestions from our <strong>Local Database</strong> and the <strong>Web Travel Guides</strong>.
          </p>
        </div>

        <button 
          onClick={() => navigate("/plans")} 
          className="btn btn-outline btn-sm rounded-xl gap-2 text-xs font-bold shrink-0 self-start md:self-auto"
        >
          <Layers className="w-4 h-4 text-primary" /> Browse All Community Plans
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Form: Specifications */}
        <div className="lg:col-span-4 card bg-base-100 border border-base-200 shadow-sm p-6 space-y-5 rounded-2xl">
          <div className="flex items-center justify-between border-b border-base-200 pb-3">
            <h3 className="font-black text-sm flex items-center gap-2 m-0 text-base-content">
              <Compass className="w-4 h-4 text-primary" /> Trip Specifications
            </h3>
            <span className="text-[10px] text-base-content/50 font-bold uppercase tracking-wider">Parameters</span>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4 text-xs">
            
            {/* Starting Location */}
            <div className="form-control space-y-1">
              <label className="font-bold text-base-content/80 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary" /> Starting From
              </label>
              <input
                type="text"
                list="ai-start-cities"
                placeholder="e.g. Dhaka, Chattogram..."
                className="input input-sm input-bordered w-full rounded-xl"
                value={startingLocation}
                onChange={(e) => setStartingLocation(e.target.value)}
                required
              />
              <datalist id="ai-start-cities">
                {STARTING_CITIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            {/* Destination */}
            <div className="form-control space-y-1">
              <label className="font-bold text-base-content/80 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-secondary" /> Destination
              </label>
              <input 
                type="text" 
                list="ai-builder-destinations"
                placeholder="e.g. Cox's Bazar, Sajek, Sreemangal..." 
                className="input input-sm input-bordered w-full rounded-xl"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                required
              />
              <datalist id="ai-builder-destinations">
                {POPULAR_DESTINATIONS.map(d => (
                  <option key={d} value={d} />
                ))}
              </datalist>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {["Cox's Bazar", "Sajek Valley", "Sreemangal"].map(d => (
                  <button 
                    key={d} 
                    type="button" 
                    onClick={() => setDestination(d)}
                    className={`badge badge-xs py-2 px-2.5 transition-all ${destination === d ? 'badge-primary font-bold' : 'badge-ghost text-base-content/70'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="form-control space-y-1">
              <label className="font-bold text-base-content/80 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-accent" /> Duration (Days)</span>
                <span className="badge badge-sm badge-neutral font-bold">{duration} Days</span>
              </label>
              <input 
                type="range" 
                min="1" 
                max="7" 
                value={duration} 
                onChange={(e) => setDuration(Number(e.target.value))}
                className="range range-xs range-primary" 
              />
              <div className="w-full flex justify-between text-[10px] px-1 text-base-content/50">
                <span>1d</span>
                <span>2d</span>
                <span>3d</span>
                <span>4d</span>
                <span>5d</span>
                <span>6d</span>
                <span>7d</span>
              </div>
            </div>

            {/* Budget */}
            <div className="form-control space-y-1">
              <label className="font-bold text-base-content/80 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-success" /> Max Budget (BDT)</span>
                <span className="badge badge-sm badge-success font-black text-white">{Number(budget).toLocaleString()} ৳</span>
              </label>
              <input 
                type="number" 
                className="input input-sm input-bordered w-full rounded-xl" 
                value={budget}
                step="1000"
                min="3000"
                onChange={(e) => setBudget(e.target.value)}
                required
              />
              <div className="flex gap-1.5 mt-1">
                {[8000, 15000, 25000, 40000].map(amt => (
                  <button 
                    key={amt} 
                    type="button" 
                    onClick={() => setBudget(amt)}
                    className="btn btn-xs btn-ghost border border-base-200 flex-1 text-[10px] rounded-lg"
                  >
                    {(amt / 1000)}k
                  </button>
                ))}
              </div>
            </div>

            {/* Vibe / Style */}
            <div className="form-control space-y-1">
              <label className="font-bold text-base-content/80 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-warning" /> Travel Style & Vibe
              </label>
              <select 
                className="select select-sm select-bordered w-full rounded-xl"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
              >
                <option value="Adventure">Adventure Seeking & Trekking</option>
                <option value="Budget">Backpacker / Student Budget</option>
                <option value="Luxury">Luxury Resort & Fine Dining</option>
                <option value="Nature">Nature & Eco-Tourism</option>
                <option value="Family">Family Relaxed & Safe</option>
                <option value="Cultural">Heritage & Cultural Heritage</option>
              </select>
            </div>

            {/* Transportation */}
            <div className="form-control space-y-1">
              <label className="font-bold text-base-content/80 flex items-center gap-1.5">
                <Bus className="w-3.5 h-3.5 text-info" /> Primary Transportation
              </label>
              <select 
                className="select select-sm select-bordered w-full rounded-xl"
                value={transportation}
                onChange={(e) => setTransportation(e.target.value)}
              >
                <option value="AC Bus">AC Tourist Bus (Hino/Scania/Hyundai)</option>
                <option value="Non-AC Bus">Non-AC Highway Bus</option>
                <option value="Train">Intercity Express Train (Shovon / Snigdha)</option>
                <option value="Air">Domestic Flight</option>
                <option value="Sedan">Private Sedan / SUV</option>
                <option value="Chander Gari">Chander Gari / 4x4 Mountain Jeep</option>
                <option value="Launch">Waterway Launch / Cruise</option>
              </select>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary text-slate-900 font-black w-full rounded-xl text-xs gap-2 shadow-md hover:shadow-lg transition-all mt-3" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating Packages...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-slate-900" /> Build Dual AI Packages
                </>
              )}
            </button>

          </form>
        </div>

        {/* Right Area: Results Display */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Loading State */}
          {isLoading && (
            <div className="card bg-base-100 border border-base-200 shadow-sm p-10 flex flex-col items-center justify-center text-center space-y-5 py-24 rounded-2xl">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <Sparkles className="w-7 h-7 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>
              
              <div className="max-w-md space-y-2">
                <h3 className="font-black text-lg text-base-content">
                  AI Architecture Compiling
                </h3>
                <p className="text-xs text-primary font-bold animate-pulse">
                  {stepMessage || "Analyzing destinations, routes and database spots..."}
                </p>
                <p className="text-[11px] text-base-content/50">
                  Creating two tailored packages: one anchored to LagaTour's verified safety database, and another exploring trending web travel blogs.
                </p>
              </div>

              <div className="w-full max-w-xs bg-base-200 h-2 rounded-full overflow-hidden">
                <div className="bg-primary h-full w-2/3 animate-pulse rounded-full" />
              </div>
            </div>
          )}

          {/* Empty / Intro State */}
          {!isLoading && !dualPackages && (
            <div className="card bg-base-100 border border-base-200 shadow-sm p-12 text-center py-24 rounded-2xl space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
                <Compass className="w-8 h-8" />
              </div>
              <h3 className="font-black text-xl text-base-content">Ready to Generate Your Tour Package?</h3>
              <p className="text-xs text-base-content/65 max-w-md mx-auto leading-relaxed">
                Select your origin, destination, duration, and budget. Our Gemini AI will deliver two comprehensive options with morning, afternoon, and evening timelines ready to be saved as real tour plans.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto pt-4 text-left">
                <div className="p-4 rounded-xl border border-base-200 bg-base-200/40 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-xs text-primary">
                    <Database className="w-4 h-4" /> Option 1: Local DB Verified
                  </div>
                  <p className="text-[11px] text-base-content/60">Grounded in places with real community safety ratings and GPS coordinates.</p>
                </div>
                <div className="p-4 rounded-xl border border-base-200 bg-base-200/40 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-xs text-secondary">
                    <Globe className="w-4 h-4" /> Option 2: Web & Explorer
                  </div>
                  <p className="text-[11px] text-base-content/60">Curated from travel vloggers, food forums, and hidden offbeat trails.</p>
                </div>
              </div>
            </div>
          )}

          {/* Result Cards Display */}
          {!isLoading && dualPackages && currentPackage && (
            <div className="space-y-6">
              
              {/* Dual Tab Switcher */}
              <div className="bg-base-200/70 p-1.5 rounded-2xl flex flex-col sm:flex-row gap-2 border border-base-300">
                
                {/* Tab 1: Database Grounded */}
                <button
                  type="button"
                  onClick={() => setActiveTab("database")}
                  className={`flex-1 flex items-center justify-between p-3.5 rounded-xl transition-all text-left ${
                    activeTab === "database"
                      ? "bg-base-100 shadow-sm border border-primary/30 text-base-content"
                      : "hover:bg-base-100/50 text-base-content/60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      activeTab === "database" ? "bg-primary text-slate-900" : "bg-base-300 text-base-content/60"
                    }`}>
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs">🏛️ LagaTour DB Grounded</span>
                        {activeTab === "database" && (
                          <span className="badge badge-primary badge-xs font-bold text-[9px]">Active</span>
                        )}
                      </div>
                      <p className="text-[10px] text-base-content/60 truncate max-w-[220px]">
                        Verified community spots & safety ratings
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 transition-transform ${activeTab === "database" ? "text-primary translate-x-0.5" : "opacity-30"}`} />
                </button>

                {/* Tab 2: Web Explorer */}
                <button
                  type="button"
                  onClick={() => setActiveTab("web")}
                  className={`flex-1 flex items-center justify-between p-3.5 rounded-xl transition-all text-left ${
                    activeTab === "web"
                      ? "bg-base-100 shadow-sm border border-secondary/30 text-base-content"
                      : "hover:bg-base-100/50 text-base-content/60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      activeTab === "web" ? "bg-secondary text-white" : "bg-base-300 text-base-content/60"
                    }`}>
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs">🌐 Web Explorer & Gems</span>
                        {activeTab === "web" && (
                          <span className="badge badge-secondary badge-xs font-bold text-[9px]">Active</span>
                        )}
                      </div>
                      <p className="text-[10px] text-base-content/60 truncate max-w-[220px]">
                        Curated from blogs, vloggers & secret foodie spots
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 transition-transform ${activeTab === "web" ? "text-secondary translate-x-0.5" : "opacity-30"}`} />
                </button>

              </div>

              {/* Package Details Main Card */}
              <div className="card bg-base-100 border border-base-200 shadow-sm p-6 md:p-8 rounded-2xl space-y-6">
                
                {/* Header Information */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-base-200">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`badge badge-sm font-black text-[10px] py-1 px-2.5 ${
                        currentPackage.sourceType === "database"
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "bg-secondary/20 text-secondary border border-secondary/30"
                      }`}>
                        {currentPackage.sourceType === "database" ? "🏛️ Verified DB Circuit" : "🌐 Web Explorer Trail"}
                      </span>
                      <span className="badge badge-sm badge-ghost text-[10px] font-bold">
                        {currentPackage.travelType || style} Style
                      </span>
                    </div>

                    <h2 className="text-xl md:text-2xl font-black text-base-content tracking-tight">
                      {currentPackage.title}
                    </h2>
                    
                    <p className="text-xs text-base-content/70 italic">
                      "{currentPackage.tagline}"
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-base-content/60 pt-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-primary" /> {currentPackage.startingLocation} ➔ {currentPackage.destination}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-accent" /> {currentPackage.durationDays} Days / {Math.max(1, currentPackage.durationDays - 1)} Nights
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Bus className="w-3.5 h-3.5 text-info" /> {currentPackage.transportation}
                      </span>
                    </div>
                  </div>

                  {/* Save Button / Action */}
                  <div className="shrink-0 flex flex-col gap-2">
                    {saveSuccessId ? (
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => navigate("/plans")} 
                          className="btn btn-sm btn-success text-white font-black rounded-xl text-xs gap-1.5 shadow-sm"
                        >
                          <CheckCircle2 className="w-4 h-4" /> View in Tour Plans
                        </button>
                        <span className="text-[10px] text-success font-semibold text-center">
                          Saved to MySQL Database!
                        </span>
                      </div>
                    ) : (
                      <button 
                        onClick={handleSaveToMyPlans}
                        disabled={isSaving}
                        className="btn btn-sm btn-primary text-slate-900 font-black rounded-xl text-xs gap-2 shadow-md hover:shadow-lg transition-all"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Saving Plan...
                          </>
                        ) : (
                          <>
                            <FileCheck className="w-4 h-4" /> Create Tour Package
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expense Splits */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-success" /> Budget Splits & Allocation
                    </span>
                    <span className="text-xs font-black text-success">
                      Total: {Number(currentPackage.totalBudget).toLocaleString()} BDT
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(currentPackage.expenseBreakdown || []).map((exp, idx) => (
                      <div key={idx} className="bg-base-200/60 border border-base-300 p-3 rounded-xl flex flex-col">
                        <span className="text-[10px] font-semibold text-base-content/60">{exp.category}</span>
                        <span className="text-sm font-black text-base-content mt-1">
                          {Number(exp.amount).toLocaleString()} ৳
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Day-by-Day Granular Time Slots */}
                <div className="space-y-4 pt-2">
                  <span className="text-xs font-black uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary" /> Day-by-Day Time Slot Itinerary
                  </span>

                  <div className="space-y-4">
                    {(currentPackage.days || []).map((dayItem) => (
                      <div key={dayItem.day} className="border border-base-300 bg-base-200/30 rounded-2xl p-4 md:p-5 space-y-4">
                        
                        {/* Day Header */}
                        <div className="flex items-center justify-between border-b border-base-300 pb-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="badge badge-primary font-black text-slate-900 text-xs py-2 px-3">
                              Day {dayItem.day}
                            </span>
                            <h4 className="font-bold text-xs md:text-sm text-base-content m-0">
                              {dayItem.theme}
                            </h4>
                          </div>
                        </div>

                        {/* 3 Time Slots: Morning, Afternoon, Evening */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          
                          {/* Morning */}
                          <div className="bg-base-100 border border-base-200 p-3.5 rounded-xl space-y-2 flex flex-col justify-between">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-warning">
                                <span className="flex items-center gap-1 text-[11px] font-bold">
                                  <Sunrise className="w-3.5 h-3.5" /> Morning
                                </span>
                                <span className="text-[9px] text-base-content/50 font-medium">
                                  {dayItem.morning?.time || "08:00 AM - 12:00 PM"}
                                </span>
                              </div>
                              <p className="font-bold text-xs text-base-content leading-snug">
                                📍 {dayItem.morning?.spot || "Departure & Sightseeing"}
                              </p>
                              <p className="text-[11px] text-base-content/75 leading-relaxed">
                                {dayItem.morning?.activity}
                              </p>
                            </div>
                            {dayItem.morning?.foodTip && (
                              <div className="pt-2 border-t border-base-200/80 flex items-start gap-1.5 text-[10px] text-base-content/60 italic">
                                <Utensils className="w-3 h-3 text-warning shrink-0 mt-0.5" />
                                <span>{dayItem.morning.foodTip}</span>
                              </div>
                            )}
                          </div>

                          {/* Afternoon */}
                          <div className="bg-base-100 border border-base-200 p-3.5 rounded-xl space-y-2 flex flex-col justify-between">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-info">
                                <span className="flex items-center gap-1 text-[11px] font-bold">
                                  <Sun className="w-3.5 h-3.5" /> Afternoon
                                </span>
                                <span className="text-[9px] text-base-content/50 font-medium">
                                  {dayItem.afternoon?.time || "01:00 PM - 05:00 PM"}
                                </span>
                              </div>
                              <p className="font-bold text-xs text-base-content leading-snug">
                                📍 {dayItem.afternoon?.spot || "Excursion Spot"}
                              </p>
                              <p className="text-[11px] text-base-content/75 leading-relaxed">
                                {dayItem.afternoon?.activity}
                              </p>
                            </div>
                            {dayItem.afternoon?.foodTip && (
                              <div className="pt-2 border-t border-base-200/80 flex items-start gap-1.5 text-[10px] text-base-content/60 italic">
                                <Utensils className="w-3 h-3 text-info shrink-0 mt-0.5" />
                                <span>{dayItem.afternoon.foodTip}</span>
                              </div>
                            )}
                          </div>

                          {/* Evening / Night */}
                          <div className="bg-base-100 border border-base-200 p-3.5 rounded-xl space-y-2 flex flex-col justify-between">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-secondary">
                                <span className="flex items-center gap-1 text-[11px] font-bold">
                                  <Moon className="w-3.5 h-3.5" /> Evening & Night
                                </span>
                                <span className="text-[9px] text-base-content/50 font-medium">
                                  {dayItem.evening?.time || "05:30 PM - 09:30 PM"}
                                </span>
                              </div>
                              <p className="font-bold text-xs text-base-content leading-snug">
                                📍 {dayItem.evening?.spot || "Sunset & Night Market"}
                              </p>
                              <p className="text-[11px] text-base-content/75 leading-relaxed">
                                {dayItem.evening?.activity}
                              </p>
                            </div>
                            {dayItem.evening?.foodTip && (
                              <div className="pt-2 border-t border-base-200/80 flex items-start gap-1.5 text-[10px] text-base-content/60 italic">
                                <Utensils className="w-3 h-3 text-secondary shrink-0 mt-0.5" />
                                <span>{dayItem.evening.foodTip}</span>
                              </div>
                            )}
                          </div>

                        </div>

                      </div>
                    ))}
                  </div>
                </div>

                {/* Sequenced Stops & Accommodation - Includes ALL visited places across days */}
                {comprehensiveStops.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-primary" /> Itinerary Route Stops ({comprehensiveStops.length} Places Visited Across All Days)
                      </span>
                      <span className="text-[10px] text-base-content/50 font-bold">
                        Sequenced Circuit
                      </span>
                    </div>

                    <div className="space-y-2">
                      {comprehensiveStops.map((stop, idx) => (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-base-200/50 border border-base-300 rounded-xl text-xs hover:border-primary/40 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-full bg-primary text-slate-900 font-black flex items-center justify-center text-[10px] shrink-0">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-base-content">{stop.placeName}</span>
                                {stop.safetyRating && (
                                  <span className="badge badge-xs badge-success text-white font-bold gap-0.5">
                                    ★ {stop.safetyRating} Safety
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-base-content/60 leading-snug mt-0.5">
                                {stop.notes}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto text-[11px] text-base-content/70">
                            {stop.hasAccommodation && (
                              <span className="badge badge-outline badge-xs py-1.5 px-2">
                                🏨 {stop.accommodationName || "Resort"} ({Number(stop.accommodationCost || 0).toLocaleString()} ৳)
                              </span>
                            )}
                            <span className="badge badge-ghost badge-xs py-1.5 px-2 font-semibold">
                              🚍 {stop.transportMode} ({Number(stop.transportCost || 0).toLocaleString()} ৳)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tips & Packing Checklist in 2 Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  
                  {/* Local Safety & Travel Tips */}
                  <div className="p-4 bg-warning/10 border border-warning/20 rounded-2xl space-y-2.5">
                    <div className="flex items-center gap-2 text-warning font-bold text-xs">
                      <ShieldCheck className="w-4 h-4" /> AI Safety & Travel Recommendations
                    </div>
                    <ul className="space-y-1.5 text-xs text-base-content/80 list-disc list-inside">
                      {(currentPackage.tips || []).map((tip, idx) => (
                        <li key={idx} className="leading-relaxed">{tip}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Packing Checklist */}
                  <div className="p-4 bg-info/10 border border-info/20 rounded-2xl space-y-2.5">
                    <div className="flex items-center gap-2 text-info font-bold text-xs">
                      <Luggage className="w-4 h-4" /> Suggested Packing Checklist
                    </div>
                    <div className="space-y-1.5">
                      {(currentPackage.packingChecklist || []).map((item, idx) => (
                        <label key={idx} className="flex items-center gap-2 cursor-pointer text-xs text-base-content/80">
                          <input 
                            type="checkbox" 
                            checked={Boolean(checkedItems[idx])} 
                            onChange={() => toggleChecklist(idx)}
                            className="checkbox checkbox-xs checkbox-info rounded" 
                          />
                          <span className={checkedItems[idx] ? "line-through opacity-50" : ""}>{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Bottom Call to Action */}
                <div className="pt-4 border-t border-base-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-xs text-base-content/60">
                    Want to customize or collaborate? Save this package and edit stops or invite travel buddies anytime.
                  </p>

                  <button 
                    onClick={handleSaveToMyPlans}
                    disabled={isSaving || Boolean(saveSuccessId)}
                    className="btn btn-primary text-slate-900 font-black rounded-xl text-xs gap-2 w-full sm:w-auto shadow-md"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                      </>
                    ) : saveSuccessId ? (
                      <>
                        <Check className="w-4 h-4 text-green-700" /> Package Saved!
                      </>
                    ) : (
                      <>
                        <FileCheck className="w-4 h-4" /> Save {activeTab === "database" ? "DB Verified" : "Web Explorer"} Plan
                      </>
                    )}
                  </button>
                </div>

              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
