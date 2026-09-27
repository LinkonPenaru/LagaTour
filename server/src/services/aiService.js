import dotenv from "dotenv";
import path from "path";
import { query } from "../config/db.js";

dotenv.config();
if (!process.env.GEMINI_API_KEY) {
  dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
}

/**
 * Intelligent Fallback Generator for when Gemini API is offline or rate-limited.
 * Produces structured dual suggestions based on Bangladesh travel heuristics.
 */
function generateFallbackDualPackages({ startingLocation = "Dhaka", destination = "Cox's Bazar", duration = 3, budget = 15000, travelStyle = "Adventure", transportation = "AC Bus", dbPlaces = [] }) {
  const numDays = Math.max(1, Math.min(10, parseInt(duration, 10) || 3));
  const totalBudget = parseInt(budget, 10) || 15000;

  // Split budget realistically
  const transportCost = Math.round(totalBudget * 0.28);
  const accomCost = Math.round(totalBudget * 0.38);
  const foodCost = Math.round(totalBudget * 0.22);
  const activitiesCost = totalBudget - (transportCost + accomCost + foodCost);

  const matchedDbSpots = dbPlaces.length > 0 
    ? dbPlaces.map(p => ({ name: p.place_name, lat: Number(p.latitude || 21.4272), lng: Number(p.longitude || 92.0058), rating: Number(p.safety_rating || 4.8) }))
    : [
        { name: `${destination} Central Hub`, lat: 21.4272, lng: 92.0058, rating: 4.9 },
        { name: `${destination} Scenic Viewpoint`, lat: 21.3547, lng: 92.0315, rating: 4.8 },
        { name: `${destination} Nature Sanctuary`, lat: 21.2189, lng: 92.0461, rating: 4.7 }
      ];

  // Database Suggestion
  const dbDays = [];
  const dbStops = [];
  for (let i = 1; i <= numDays; i++) {
    const spot = matchedDbSpots[(i - 1) % matchedDbSpots.length];
    dbDays.push({
      day: i,
      theme: i === 1 ? `Departure from ${startingLocation} & Arrival in ${destination}` : (i === numDays ? `Final Sightseeing & Return to ${startingLocation}` : `Deep Exploration of ${spot.name}`),
      morning: {
        time: "07:30 AM - 11:30 AM",
        activity: i === 1 ? `Board ${transportation} from ${startingLocation}. Arrive in ${destination}, hotel check-in.` : `Morning sunrise excursion and nature walk at ${spot.name}.`,
        spot: i === 1 ? `${destination} Gateway` : spot.name,
        foodTip: "Authentic local breakfast with paratha, dal, and fresh milk tea."
      },
      afternoon: {
        time: "12:30 PM - 04:30 PM",
        activity: `Explore verified community attractions around ${spot.name} with local guides.`,
        spot: spot.name,
        foodTip: "Traditional regional curry meal with fresh fish or indigenous spices."
      },
      evening: {
        time: "05:00 PM - 09:30 PM",
        activity: `Sunset observation point, community artisan market walk, and relaxed dining.`,
        spot: `${destination} Evening Market`,
        foodTip: "Grilled local specialties, barbecue, and traditional sweetmeats."
      }
    });

    // Add all morning, afternoon, and evening places as sequenced stops
    const mSpotName = i === 1 ? `${destination} Gateway & Arrival` : `${spot.name} Viewpoint`;
    const aSpotName = spot.name;
    const eSpotName = `${destination} Evening Market & Sunset`;

    dbStops.push({
      placeName: mSpotName,
      location: `${mSpotName}, ${destination}`,
      lat: spot.lat - 0.015,
      lng: spot.lng - 0.012,
      transportMode: i === 1 ? transportation : "Local Auto / Rickshaw",
      transportCost: Math.round(transportCost / (numDays * 3)),
      hasAccommodation: false,
      accommodationName: "",
      accommodationCost: 0,
      notes: `[Day ${i} Morning] Sunrise excursion and arrival.`,
      safetyRating: spot.rating
    });

    dbStops.push({
      placeName: aSpotName,
      location: `${aSpotName}, ${destination}`,
      lat: spot.lat,
      lng: spot.lng,
      transportMode: "Local Sightseeing Transit",
      transportCost: Math.round(transportCost / (numDays * 3)),
      hasAccommodation: false,
      accommodationName: "",
      accommodationCost: 0,
      notes: `[Day ${i} Afternoon] Sightseeing at ${spot.name}.`,
      safetyRating: spot.rating
    });

    dbStops.push({
      placeName: eSpotName,
      location: `${eSpotName}, ${destination}`,
      lat: spot.lat + 0.018,
      lng: spot.lng + 0.015,
      transportMode: "Local Transit / Walking",
      transportCost: Math.round(transportCost / (numDays * 3)),
      hasAccommodation: i < numDays,
      accommodationName: travelStyle === "Luxury" ? "Luxury Eco Resort & Suites" : (travelStyle === "Budget" ? "Backpacker Eco Hostel" : "Comfort Scenic Hotel"),
      accommodationCost: i < numDays ? Math.round(accomCost / Math.max(1, numDays - 1)) : 0,
      notes: `[Day ${i} Evening] Sunset observation and artisan food.`,
      safetyRating: spot.rating
    });
  }

  const databaseSuggestion = {
    title: `${destination} Community-Verified ${travelStyle} Circuit`,
    tagline: `Grounded directly in LagaTour's registered places and community safety scores`,
    sourceType: "database",
    destination,
    startingLocation,
    durationDays: numDays,
    totalBudget,
    travelType: travelStyle === "Luxury" ? "Couple" : "Friends",
    transportation,
    accommodationType: travelStyle === "Luxury" ? "Resort" : (travelStyle === "Budget" ? "Hostel" : "Hotel"),
    coverImage: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
    expenseBreakdown: [
      { category: "Transport", amount: transportCost },
      { category: "Accommodation", amount: accomCost },
      { category: "Food & Dining", amount: foodCost },
      { category: "Activities & Sightseeing", amount: activitiesCost }
    ],
    days: dbDays,
    stops: dbStops,
    tips: [
      `Database Safety Advisory: Check local community reviews before booking informal transport.`,
      `Carry national ID or passport photocopy as required at tourism checkpoints.`,
      `Support local certified community guides for authentic insights.`
    ],
    packingChecklist: [
      "Government photo ID & photocopy",
      "Power bank & portable charger",
      "Comfortable trekking or walking shoes",
      "First-aid basics & mosquito repellent",
      "Rainproof pouch for electronics"
    ]
  };

  // Web Explorer Suggestion (Trending blog spots & hidden foodie finds)
  const webDays = [];
  const webStops = [];
  for (let i = 1; i <= numDays; i++) {
    webDays.push({
      day: i,
      theme: i === 1 ? `Scenic Journey & Secret Evening Vibes` : (i === numDays ? `Artisan Markets & Leisurely Departure` : `Hidden Gems & Local Food Crawl`),
      morning: {
        time: "08:00 AM - 11:45 AM",
        activity: i === 1 ? `Direct transit from ${startingLocation} via scenic highway. Check in at boutique lodge.` : `Hidden sunrise viewpoint recommended by top travel vloggers, away from tourist crowds.`,
        spot: `${destination} Secret Sunrise Point`,
        foodTip: "Vlogger favorite: Street-style egg poach, ruti, and spiced cardamom chai."
      },
      afternoon: {
        time: "12:45 PM - 05:00 PM",
        activity: `Off-the-beaten-path trails, photography hotspots, and visiting indie eco-cafes.`,
        spot: `${destination} Eco-Creek & Trails`,
        foodTip: "Must-try viral local restaurant known for slow-cooked claypot dishes."
      },
      evening: {
        time: "05:30 PM - 10:00 PM",
        activity: `Golden hour sunset photography session followed by a night food crawl.`,
        spot: `${destination} Cultural Night Strip`,
        foodTip: "Night market street snacks, roasted corn, fresh coconut water, and sweets."
      }
    });

    // Add all morning, afternoon, and evening web explorer spots as sequenced stops
    const wMorning = i === 1 ? `${destination} Express Arrival Point` : `${destination} Secret Sunrise Point #${i}`;
    const wAfternoon = `${destination} Eco-Creek & Nature Trails #${i}`;
    const wEvening = `${destination} Cultural Night Strip & Food Crawl`;

    webStops.push({
      placeName: wMorning,
      location: `${wMorning}, ${destination}`,
      lat: 21.4272 + (i * 0.03) - 0.015,
      lng: 92.0058 + (i * 0.02) - 0.012,
      transportMode: i === 1 ? transportation : "Local Shared Jeep / Auto",
      transportCost: Math.round(transportCost / (numDays * 3)),
      hasAccommodation: false,
      accommodationName: "",
      accommodationCost: 0,
      notes: `[Day ${i} Morning] Vlogger favorite photo spot.`,
      safetyRating: 4.85
    });

    webStops.push({
      placeName: wAfternoon,
      location: `${wAfternoon}, ${destination}`,
      lat: 21.4272 + (i * 0.03),
      lng: 92.0058 + (i * 0.02),
      transportMode: "Local Transit",
      transportCost: Math.round(transportCost / (numDays * 3)),
      hasAccommodation: false,
      accommodationName: "",
      accommodationCost: 0,
      notes: `[Day ${i} Afternoon] Off-the-beaten-path nature exploration.`,
      safetyRating: 4.85
    });

    webStops.push({
      placeName: wEvening,
      location: `${wEvening}, ${destination}`,
      lat: 21.4272 + (i * 0.03) + 0.018,
      lng: 92.0058 + (i * 0.02) + 0.015,
      transportMode: "Walking / Local Rickshaw",
      transportCost: Math.round(transportCost / (numDays * 3)),
      hasAccommodation: i < numDays,
      accommodationName: travelStyle === "Luxury" ? "Boutique Bohemian Villas" : "Hidden Hillside Cottages",
      accommodationCost: i < numDays ? Math.round(accomCost / Math.max(1, numDays - 1)) : 0,
      notes: `[Day ${i} Evening] Sunset photography and night market.`,
      safetyRating: 4.85
    });
  }

  const webSuggestion = {
    title: `${destination} Web Explorer & Culinary Trail`,
    tagline: `Curated from top web travel blogs, internet explorer forums & viral foodie spots`,
    sourceType: "web",
    destination,
    startingLocation,
    durationDays: numDays,
    totalBudget,
    travelType: travelStyle === "Budget" ? "Solo" : "Friends",
    transportation,
    accommodationType: travelStyle === "Luxury" ? "Boutique Villa" : "Eco Cottage",
    coverImage: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800",
    expenseBreakdown: [
      { category: "Transport", amount: transportCost },
      { category: "Accommodation", amount: accomCost },
      { category: "Food & Dining", amount: foodCost },
      { category: "Activities & Sightseeing", amount: activitiesCost }
    ],
    days: webDays,
    stops: webStops,
    tips: [
      `Web Tip: Arrive at popular photo spots 30 minutes before sunrise for empty backgrounds.`,
      `Cash is king in remote street food stalls; keep smaller BDT denominations handy.`,
      `Download offline Google Maps of the region before entering remote terrain.`
    ],
    packingChecklist: [
      "Action camera or phone tripod",
      "Quick-dry lightweight clothing",
      "Reusable water bottle & electrolyte packets",
      "Compact umbrella or light windbreaker",
      "Cash wallet with 100/500 BDT notes"
    ]
  };

  return { databaseSuggestion, webSuggestion };
}

/**
 * Main Service Function: Builds dual packages using Google Gemini API + MySQL DB Grounding.
 */
export async function generateTourPackagesWithAI({
  startingLocation = "Dhaka",
  destination = "Cox's Bazar",
  duration = 3,
  budget = 15000,
  travelStyle = "Adventure",
  transportation = "AC Bus"
}) {
  // 1. Fetch relevant places from MySQL DB for grounding
  let dbPlaces = [];
  try {
    const searchPattern = `%${destination.trim()}%`;
    dbPlaces = await query(`
      SELECT place_id, place_name, division, district, latitude, longitude, safety_rating, description
      FROM places
      WHERE place_name LIKE ? OR division LIKE ? OR district LIKE ? OR description LIKE ?
      ORDER BY safety_rating DESC
      LIMIT 8
    `, [searchPattern, searchPattern, searchPattern, searchPattern]);

    if (dbPlaces.length === 0) {
      // Fallback to top rated spots in DB if exact match is empty
      dbPlaces = await query(`
        SELECT place_id, place_name, division, district, latitude, longitude, safety_rating, description
        FROM places
        ORDER BY safety_rating DESC
        LIMIT 6
      `);
    }
  } catch (err) {
    console.error("Warning: DB places query error for AI grounding:", err.message);
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // If no Gemini API key configured, use intelligent fallback immediately
  if (!apiKey || apiKey.trim() === "") {
    console.warn("⚠️ No GEMINI_API_KEY detected in .env. Using intelligent fallback generator.");
    return generateFallbackDualPackages({ startingLocation, destination, duration, budget, travelStyle, transportation, dbPlaces });
  }

  // 2. Prepare Grounding Context
  const dbContextText = dbPlaces.length > 0
    ? dbPlaces.map(p => `- ${p.place_name} (${p.district || p.division || 'Bangladesh'}, Lat: ${p.latitude}, Lng: ${p.longitude}, Community Safety: ${p.safety_rating}/5.0): ${p.description || 'Scenic community travel spot'}`).join("\n")
    : "No registered database spots found. Use well-known geographical landmarks of this destination.";

  const prompt = `
You are the Lead Travel AI Architect for "LagaTour" (a Bangladeshi travel and community platform).
A user requests a customized tour package with these specifications:
- Starting Location: "${startingLocation}"
- Destination: "${destination}"
- Duration: ${duration} Days
- Total Budget Limit: ${budget} BDT
- Travel Style: "${travelStyle}" (e.g. Adventure, Budget, Luxury, Nature, Family)
- Transportation Preference: "${transportation}"

Generate TWO distinct, complete, realistic tour package options as a strict JSON object with keys "databaseSuggestion" and "webSuggestion":

1. "databaseSuggestion":
   - GROUNDED in LagaTour's registered database places:
${dbContextText}
   - Must prioritize these verified spots and highlight their community safety ratings and coordinates.
   - Tailor the pacing, activities, and budget splits for realistic Bangladeshi travel conditions.

2. "webSuggestion":
   - GROUNDED in broad internet travel intelligence (travel blogs, TripAdvisor, Bangladeshi traveler group forums, secret foodie spots, offbeat viewpoints).
   - Recommends hidden gems, viral local eateries, and off-the-beaten-path experiences.

JSON SCHEMA REQUIREMENT:
{
  "databaseSuggestion": {
    "title": "string",
    "tagline": "string",
    "sourceType": "database",
    "destination": "${destination}",
    "startingLocation": "${startingLocation}",
    "durationDays": ${duration},
    "totalBudget": ${budget},
    "travelType": "string (Solo | Friends | Family | Couple)",
    "transportation": "${transportation}",
    "accommodationType": "string",
    "coverImage": "string (valid high quality Unsplash travel image URL)",
    "expenseBreakdown": [
      { "category": "Transport", "amount": number },
      { "category": "Accommodation", "amount": number },
      { "category": "Food & Dining", "amount": number },
      { "category": "Activities & Sightseeing", "amount": number }
    ],
    "days": [
      {
        "day": 1,
        "theme": "string",
        "morning": { "time": "08:00 AM - 12:00 PM", "activity": "string", "spot": "string", "foodTip": "string" },
        "afternoon": { "time": "01:00 PM - 05:00 PM", "activity": "string", "spot": "string", "foodTip": "string" },
        "evening": { "time": "05:30 PM - 09:30 PM", "activity": "string", "spot": "string", "foodTip": "string" }
      }
    ],
    "stops": [
      // CRITICAL: MUST include EVERY SINGLE PLACE visited from Morning, Afternoon, and Evening of all ${duration} days in sequential order (totaling at least 2-3 stops per day, e.g. Kolatoli Beach, Himchari Waterfall, Inani Beach, etc.).
      {
        "placeName": "Exact name of specific visited place (e.g. Kolatoli Beach, Himchari National Park, Inani Coral Beach, etc.)",
        "location": "string",
        "lat": number,
        "lng": number,
        "transportMode": "string",
        "transportCost": number,
        "hasAccommodation": boolean,
        "accommodationName": "string",
        "accommodationCost": number,
        "notes": "string",
        "safetyRating": number
      }
    ],
    "tips": ["string", "string", "string"],
    "packingChecklist": ["string", "string", "string", "string"]
  },
  "webSuggestion": {
    "title": "string",
    "tagline": "string",
    "sourceType": "web",
    "destination": "${destination}",
    "startingLocation": "${startingLocation}",
    "durationDays": ${duration},
    "totalBudget": ${budget},
    "travelType": "string",
    "transportation": "${transportation}",
    "accommodationType": "string",
    "coverImage": "string",
    "expenseBreakdown": [
      { "category": "Transport", "amount": number },
      { "category": "Accommodation", "amount": number },
      { "category": "Food & Dining", "amount": number },
      { "category": "Activities & Sightseeing", "amount": number }
    ],
    "days": [
      {
        "day": 1,
        "theme": "string",
        "morning": { "time": "08:00 AM - 12:00 PM", "activity": "string", "spot": "string", "foodTip": "string" },
        "afternoon": { "time": "01:00 PM - 05:00 PM", "activity": "string", "spot": "string", "foodTip": "string" },
        "evening": { "time": "05:30 PM - 09:30 PM", "activity": "string", "spot": "string", "foodTip": "string" }
      }
    ],
    "stops": [
      // CRITICAL: MUST include EVERY SINGLE PLACE visited from Morning, Afternoon, and Evening of all ${duration} days in sequential order (totaling at least 2-3 stops per day, e.g. Kolatoli Beach, Himchari Waterfall, Inani Beach, etc.).
      {
        "placeName": "Exact name of specific visited place (e.g. Kolatoli Beach, Himchari National Park, Inani Coral Beach, etc.)",
        "location": "string",
        "lat": number,
        "lng": number,
        "transportMode": "string",
        "transportCost": number,
        "hasAccommodation": boolean,
        "accommodationName": "string",
        "accommodationCost": number,
        "notes": "string",
        "safetyRating": number
      }
    ],
    "tips": ["string", "string", "string"],
    "packingChecklist": ["string", "string", "string", "string"]
  }
}

Return strictly valid JSON matching this schema with exact day counts (${duration} days). No markdown code fences, no extra text.
`;

  const candidateModels = ["gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Model ${model} returned (${response.status}): ${errText.substring(0, 100)}... Trying next.`);
        continue;
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      if (!candidate || !candidate.content?.parts?.[0]?.text) {
        console.warn(`Model ${model} response missing candidate text. Trying next.`);
        continue;
      }

      const rawJsonText = candidate.content.parts[0].text.trim();
      const parsed = JSON.parse(rawJsonText);

      if (parsed.databaseSuggestion && parsed.webSuggestion) {
        console.log(`✅ Successfully generated dual tour package via model: ${model}`);
        return parsed;
      }
    } catch (modelErr) {
      console.warn(`Error trying model ${model}:`, modelErr.message);
    }
  }

  console.warn("⚠️ All Gemini models failed or busy. Falling back to local knowledge engine.");
  return generateFallbackDualPackages({ startingLocation, destination, duration, budget, travelStyle, transportation, dbPlaces });
}

// AI Tour Plan Optimization Service for LagaTour
// Supports ANY Division, ANY District, or ANY Tour Place in Bangladesh!

// Comprehensive Bangladesh Tourism Geo-Database (Covering all 8 Divisions and Major Districts)
export const REGIONAL_SPOTS = [
  // ===================== DHAKA DIVISION & DISTRICTS =====================
  { id: "spot_lalbagh", name: "Lalbagh Mughal Fort", region: "Dhaka", division: "Dhaka", district: "Dhaka", lat: 23.7196, lng: 90.3881, avgCost: 50, avgHours: 2.0, type: "Historical Fort", image: "https://images.unsplash.com/photo-1584646098378-0874589d76b1?w=600" },
  { id: "spot_ahsan_manzil", name: "Ahsan Manzil Pink Palace", region: "Dhaka", division: "Dhaka", district: "Dhaka", lat: 23.7086, lng: 90.4061, avgCost: 50, avgHours: 2.0, type: "Heritage Palace", image: "https://images.unsplash.com/photo-1584646098378-0874589d76b1?w=600" },
  { id: "spot_parliament", name: "National Parliament & Crescent Lake", region: "Dhaka", division: "Dhaka", district: "Dhaka", lat: 23.7629, lng: 90.3786, avgCost: 0, avgHours: 1.5, type: "Modern Landmark", image: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600" },
  { id: "spot_dhakeshwari", name: "Dhakeshwari National Temple", region: "Dhaka", division: "Dhaka", district: "Dhaka", lat: 23.7228, lng: 90.3905, avgCost: 0, avgHours: 1.5, type: "Ancient Heritage", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" },
  { id: "spot_curzon_hall", name: "Curzon Hall & Shahid Minar Campus", region: "Dhaka", division: "Dhaka", district: "Dhaka", lat: 23.7267, lng: 90.4014, avgCost: 0, avgHours: 2.0, type: "Colonial Architecture", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },
  { id: "spot_hatirjheel", name: "Hatirjheel Waterfront & Water Taxi", region: "Dhaka", division: "Dhaka", district: "Dhaka", lat: 23.7667, lng: 90.4167, avgCost: 150, avgHours: 2.0, type: "Urban Waterfront", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_sonargaon", name: "Sonargaon Ancient Capital & Panam City", region: "Narayanganj", division: "Dhaka", district: "Narayanganj", lat: 23.6495, lng: 90.6015, avgCost: 150, avgHours: 3.5, type: "Ancient Ghost City", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },
  { id: "spot_bhawal", name: "Bhawal Sal Forest National Park", region: "Gazipur", division: "Dhaka", district: "Gazipur", lat: 24.0984, lng: 90.4131, avgCost: 100, avgHours: 3.0, type: "Eco Woodland Trek", image: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=600" },
  { id: "spot_mohera", name: "Mohera Zamindar Bari & Royal Palace", region: "Tangail", division: "Dhaka", district: "Tangail", lat: 24.2389, lng: 90.0389, avgCost: 100, avgHours: 3.0, type: "Aristocratic Zamindar Palace", image: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600" },
  { id: "spot_201_dome", name: "201 Dome Mosque (South Asia Architecture)", region: "Tangail", division: "Dhaka", district: "Tangail", lat: 24.5833, lng: 89.8667, avgCost: 50, avgHours: 2.0, type: "Architectural Marvel", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },
  { id: "spot_dhanbari", name: "Dhanbari Royal Nawab Palace & Heritage", region: "Tangail", division: "Dhaka", district: "Tangail", lat: 24.6789, lng: 89.9678, avgCost: 150, avgHours: 2.5, type: "Nawab Heritage Resort", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" },
  { id: "spot_nikli_haor", name: "Nikli All-Weather Haor & Speedboat Cruise", region: "Kishoreganj", division: "Dhaka", district: "Kishoreganj", lat: 24.3211, lng: 90.9356, avgCost: 500, avgHours: 4.0, type: "Wetland All-Weather Trail", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_idrakpur", name: "Idrakpur River Water Fort", region: "Munshiganj", division: "Dhaka", district: "Munshiganj", lat: 23.5422, lng: 90.5305, avgCost: 50, avgHours: 1.5, type: "River Defense Fort", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },

  // ===================== CHATTOGRAM DIVISION & DISTRICTS =====================
  { id: "spot_patenga", name: "Patenga Sea Beach & Estuary View", region: "Chattogram", division: "Chattogram", district: "Chattogram", lat: 22.2359, lng: 91.7915, avgCost: 50, avgHours: 2.5, type: "Coastal Sunset Beach", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_batali", name: "Batali Hill Panoramic Viewpoint", region: "Chattogram", division: "Chattogram", district: "Chattogram", lat: 22.3486, lng: 91.8211, avgCost: 0, avgHours: 1.5, type: "Hilltop Vista", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600" },
  { id: "spot_foys_lake", name: "Foy's Lake Scenic Cruise & Sea World", region: "Chattogram", division: "Chattogram", district: "Chattogram", lat: 22.3700, lng: 91.8028, avgCost: 350, avgHours: 3.5, type: "Amusement & Lake Cruise", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" },
  { id: "spot_chandranath", name: "Chandranath Temple Mountain Peak", region: "Sitakunda", division: "Chattogram", district: "Chattogram", lat: 22.6289, lng: 91.6811, avgCost: 100, avgHours: 4.5, type: "Mountain Summit Trek", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600" },
  { id: "spot_guliakhali", name: "Guliakhali Sea Beach (Green Grass Carpet)", region: "Sitakunda", division: "Chattogram", district: "Chattogram", lat: 22.5833, lng: 91.6167, avgCost: 150, avgHours: 3.0, type: "Canal & Mangrove Beach", image: "https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=600" },
  { id: "spot_mohamaya", name: "Mohamaya Lake & Kayak Expedition", region: "Mirsharai", division: "Chattogram", district: "Chattogram", lat: 22.8444, lng: 91.5667, avgCost: 300, avgHours: 3.0, type: "Freshwater Lake Kayak", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_kolatoli", name: "Kolatoli Beach & Surfing Waves", region: "Cox's Bazar", division: "Chattogram", district: "Cox's Bazar", lat: 21.4272, lng: 92.0058, avgCost: 0, avgHours: 2.0, type: "Beach & Sunset", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_inani", name: "Inani Coral Stone Beach", region: "Cox's Bazar", division: "Chattogram", district: "Cox's Bazar", lat: 21.1843, lng: 92.0520, avgCost: 150, avgHours: 3.0, type: "Coral Beach", image: "https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=600" },
  { id: "spot_himchari", name: "Himchari National Park & Waterfall", region: "Cox's Bazar", division: "Chattogram", district: "Cox's Bazar", lat: 21.3533, lng: 92.0306, avgCost: 100, avgHours: 2.5, type: "Hill View & Park", image: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=600" },
  { id: "spot_marine_drive", name: "Marine Drive Scenic Coastal Ride", region: "Cox's Bazar", division: "Chattogram", district: "Cox's Bazar", lat: 21.2800, lng: 92.0400, avgCost: 600, avgHours: 2.0, type: "Coastal Drive", image: "https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=600" },
  { id: "spot_st_martin_west", name: "St. Martin West Beach & Coconut Groves", region: "Saint Martin", division: "Chattogram", district: "Cox's Bazar", lat: 20.6274, lng: 92.3225, avgCost: 200, avgHours: 3.0, type: "Coral Island", image: "https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=600" },
  { id: "spot_chera_dwip", name: "Chera Dwip Coral Reef Expedition", region: "Saint Martin", division: "Chattogram", district: "Cox's Bazar", lat: 20.5894, lng: 92.3382, avgCost: 350, avgHours: 3.0, type: "Snorkeling & Reef", image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600" },
  { id: "spot_ruilui", name: "Ruilui Para Cultural Village", region: "Sajek", division: "Chattogram", district: "Rangamati", lat: 23.3820, lng: 92.2938, avgCost: 200, avgHours: 2.5, type: "Village & Culture", image: "https://images.unsplash.com/photo-1627894483216-2138af692e32?w=600" },
  { id: "spot_konglak", name: "Konglak Peak Cloud Walk", region: "Sajek", division: "Chattogram", district: "Rangamati", lat: 23.4011, lng: 92.3015, avgCost: 100, avgHours: 3.0, type: "Mountain Peak", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600" },
  { id: "spot_sajek_helipad", name: "Sajek Helipad Sunset Viewpoint", region: "Sajek", division: "Chattogram", district: "Rangamati", lat: 23.3855, lng: 92.2950, avgCost: 0, avgHours: 1.5, type: "Sunset Viewpoint", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" },
  { id: "spot_kaptai_lake", name: "Kaptai Lake Cruise & Hanging Bridge", region: "Rangamati", division: "Chattogram", district: "Rangamati", lat: 22.4975, lng: 92.2195, avgCost: 800, avgHours: 3.5, type: "Lake Cruise", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_risang", name: "Risang Waterfall & Stream", region: "Khagrachari", division: "Chattogram", district: "Khagrachari", lat: 23.1672, lng: 91.9542, avgCost: 50, avgHours: 2.0, type: "Waterfall", image: "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=600" },
  { id: "spot_alutila", name: "Alutila Mysterious Cave", region: "Khagrachari", division: "Chattogram", district: "Khagrachari", lat: 23.1368, lng: 91.9702, avgCost: 50, avgHours: 2.0, type: "Cave Trek", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },
  { id: "spot_nilgiri", name: "Nilgiri Cloud Resort & Summit", region: "Bandarban", division: "Chattogram", district: "Bandarban", lat: 21.9167, lng: 92.3333, avgCost: 400, avgHours: 3.5, type: "Cloud Summit", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600" },
  { id: "spot_boga_lake", name: "Mystic Boga Volcano Lake", region: "Bandarban", division: "Chattogram", district: "Bandarban", lat: 21.9833, lng: 92.4833, avgCost: 500, avgHours: 4.0, type: "Crater Lake Trek", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" },
  { id: "spot_golden_temple", name: "Buddha Dhatu Jadi (Golden Temple)", region: "Bandarban", division: "Chattogram", district: "Bandarban", lat: 22.2150, lng: 92.2080, avgCost: 100, avgHours: 1.5, type: "Architectural Temple", image: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600" },
  { id: "spot_chimbuk", name: "Chimbuk Hill & Tribal Hamlet", region: "Bandarban", division: "Chattogram", district: "Bandarban", lat: 22.0833, lng: 92.2500, avgCost: 150, avgHours: 2.0, type: "Mountain Trail", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600" },
  { id: "spot_shalban", name: "Shalban Vihara & Mainamati Buddhist Ruins", region: "Cumilla", division: "Chattogram", district: "Cumilla", lat: 23.4289, lng: 91.1344, avgCost: 50, avgHours: 2.5, type: "7th-Century Monastery", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },
  { id: "spot_dharmasagar", name: "Dharmasagar Historic Dighi & Park", region: "Cumilla", division: "Chattogram", district: "Cumilla", lat: 23.4611, lng: 91.1811, avgCost: 20, avgHours: 1.5, type: "Royal Reservoir Lake", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },

  // ===================== SYLHET DIVISION & DISTRICTS =====================
  { id: "spot_ratargul", name: "Ratargul Freshwater Swamp Forest", region: "Sylhet", division: "Sylhet", district: "Sylhet", lat: 25.0016, lng: 91.9312, avgCost: 400, avgHours: 2.5, type: "Swamp Forest Boat", image: "https://images.unsplash.com/photo-1518457607834-6e8d80c183c5?w=600" },
  { id: "spot_jaflong", name: "Jaflong Zero Point & Tea Foothills", region: "Sylhet", division: "Sylhet", district: "Sylhet", lat: 25.1634, lng: 92.0175, avgCost: 300, avgHours: 3.0, type: "Stone River & Hills", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600" },
  { id: "spot_lalakhal", name: "Lalakhal Emerald Blue River Cruise", region: "Sylhet", division: "Sylhet", district: "Sylhet", lat: 25.1189, lng: 92.1865, avgCost: 600, avgHours: 2.5, type: "Emerald River Cruise", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_sada_pathor", name: "Bholaganj Sada Pathor White Stones", region: "Sylhet", division: "Sylhet", district: "Sylhet", lat: 25.1558, lng: 91.7580, avgCost: 500, avgHours: 3.5, type: "Alpine River Beds", image: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600" },
  { id: "spot_shah_jalal", name: "Hazrat Shah Jalal Mazar Sharif & Dargah", region: "Sylhet", division: "Sylhet", district: "Sylhet", lat: 24.9015, lng: 91.8680, avgCost: 0, avgHours: 1.5, type: "Spiritual Shrine", image: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600" },
  { id: "spot_malnicherra", name: "Malnicherra Historical Tea Estate", region: "Sylhet", division: "Sylhet", district: "Sylhet", lat: 24.9280, lng: 91.8820, avgCost: 100, avgHours: 2.0, type: "Oldest Tea Garden", image: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600" },
  { id: "spot_bisnakandi", name: "Bisnakandi Stream & Meghalaya Falls", region: "Sylhet", division: "Sylhet", district: "Sylhet", lat: 25.1764, lng: 91.9125, avgCost: 450, avgHours: 3.0, type: "Mountain Stream Valley", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" },
  { id: "spot_lawachara", name: "Lawachara National Rainforest", region: "Sreemangal", division: "Sylhet", district: "Moulvibazar", lat: 24.3267, lng: 91.7850, avgCost: 200, avgHours: 2.5, type: "Rainforest Sanctuary", image: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=600" },
  { id: "spot_madhabpur", name: "Madhabpur Lotus Lake & Tea Estate", region: "Sreemangal", division: "Sylhet", district: "Moulvibazar", lat: 24.1750, lng: 91.8020, avgCost: 100, avgHours: 2.0, type: "Lotus Lake", image: "https://images.unsplash.com/photo-1518457607834-6e8d80c183c5?w=600" },
  { id: "spot_seven_color_tea", name: "Nilkantha 7-Layer Colored Tea Stall", region: "Sreemangal", division: "Sylhet", district: "Moulvibazar", lat: 24.2985, lng: 91.7342, avgCost: 120, avgHours: 1.0, type: "Food Heritage", image: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600" },
  { id: "spot_tanguar", name: "Tanguar Haor Ramsar Wetland Sanctuary", region: "Sunamganj", division: "Sylhet", district: "Sunamganj", lat: 25.1270, lng: 91.0740, avgCost: 1200, avgHours: 4.0, type: "Luxury Houseboat", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_shimul_bagan", name: "Shimul Bagan Red Cotton Forest", region: "Sunamganj", division: "Sylhet", district: "Sunamganj", lat: 25.1120, lng: 91.1340, avgCost: 100, avgHours: 2.0, type: "Botanical Forest", image: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=600" },
  { id: "spot_niladri", name: "Niladri Blue Lake (Shahid Siraj Lake)", region: "Sunamganj", division: "Sylhet", district: "Sunamganj", lat: 25.1812, lng: 91.1165, avgCost: 150, avgHours: 2.5, type: "Limestone Blue Lake", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" },

  // ===================== RANGPUR DIVISION & DISTRICTS (North Bengal) =====================
  { id: "spot_tetulia", name: "Tetulia Kanchenjunga Viewpoint & Tea Estates", region: "Panchagarh", division: "Rangpur", district: "Panchagarh", lat: 26.4911, lng: 88.3544, avgCost: 150, avgHours: 3.5, type: "Himalayan Viewpoint", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600" },
  { id: "spot_banglabandha", name: "Banglabandha Zero Point & Tri-Junction", region: "Panchagarh", division: "Rangpur", district: "Panchagarh", lat: 26.6500, lng: 88.3833, avgCost: 50, avgHours: 2.0, type: "Northernmost Frontier", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" },
  { id: "spot_kantaji", name: "Kantajew Temple (Terracotta Kantaji Mandir)", region: "Dinajpur", division: "Rangpur", district: "Dinajpur", lat: 25.7928, lng: 88.6653, avgCost: 50, avgHours: 2.5, type: "18th Century Terracotta Art", image: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600" },
  { id: "spot_ramsagar", name: "Ramsagar National Lake & Eco Park", region: "Dinajpur", division: "Rangpur", district: "Dinajpur", lat: 25.5539, lng: 88.6256, avgCost: 50, avgHours: 2.5, type: "Largest Historic Lake", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_tajhat", name: "Tajhat Royal Palace (Rangpur Rajbari)", region: "Rangpur", division: "Rangpur", district: "Rangpur", lat: 25.7208, lng: 89.2678, avgCost: 50, avgHours: 2.0, type: "Palatial Royal Estate", image: "https://images.unsplash.com/photo-1584646098378-0874589d76b1?w=600" },
  { id: "spot_vinnya_jagat", name: "Vinnya Jagat Amusement & Eco Park", region: "Rangpur", division: "Rangpur", district: "Rangpur", lat: 25.8234, lng: 89.1567, avgCost: 200, avgHours: 3.5, type: "Amusement Valley", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },

  // ===================== MYMENSINGH DIVISION & DISTRICTS =====================
  { id: "spot_susang_durgapur", name: "Susang Durgapur Shomeshwari River & Ceramic Lake", region: "Netrokona", division: "Mymensingh", district: "Netrokona", lat: 25.1233, lng: 90.6867, avgCost: 400, avgHours: 4.0, type: "White Clay Blue Lake", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" },
  { id: "spot_shashi_lodge", name: "Shashi Lodge & Alexander Castle", region: "Mymensingh", division: "Mymensingh", district: "Mymensingh", lat: 24.7578, lng: 90.4122, avgCost: 50, avgHours: 2.0, type: "Victorian Zamindar Palace", image: "https://images.unsplash.com/photo-1584646098378-0874589d76b1?w=600" },
  { id: "spot_madhutila", name: "Madhutila Eco Park & Hill View", region: "Sherpur", division: "Mymensingh", district: "Sherpur", lat: 25.1878, lng: 90.1344, avgCost: 100, avgHours: 3.0, type: "Foothill Forest Sanctuary", image: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=600" },
  { id: "spot_bau_botanical", name: "BAU Botanical Garden & Brahmaputra Waterfront", region: "Mymensingh", division: "Mymensingh", district: "Mymensingh", lat: 24.7244, lng: 90.4311, avgCost: 30, avgHours: 2.0, type: "Botanical River Reserve", image: "https://images.unsplash.com/photo-1518457607834-6e8d80c183c5?w=600" },

  // ===================== BARISHAL DIVISION & DISTRICTS =====================
  { id: "spot_kuakata_beach", name: "Kuakata Sunrise & Sunset Beach (Daughter of Sea)", region: "Kuakata", division: "Barishal", district: "Patuakhali", lat: 21.8167, lng: 90.1167, avgCost: 150, avgHours: 3.5, type: "Panoramic Coastline", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_fatrar_bon", name: "Fatrar Bon Mangrove Sanctuary", region: "Kuakata", division: "Barishal", district: "Patuakhali", lat: 21.8456, lng: 90.0678, avgCost: 350, avgHours: 3.0, type: "Deep Mangrove Forest", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },
  { id: "spot_floating_guava", name: "Bhimruli Floating Guava Market", region: "Barishal", division: "Barishal", district: "Jhalokati", lat: 22.6953, lng: 90.1580, avgCost: 350, avgHours: 3.0, type: "Canal Floating Market", image: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600" },
  { id: "spot_durga_sagar", name: "Durga Sagar Historic Dighi & Island Sanctuary", region: "Barishal", division: "Barishal", district: "Barishal", lat: 22.7533, lng: 90.2811, avgCost: 50, avgHours: 2.0, type: "Historical Dighi Island", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_char_kukri", name: "Char Kukri Mukri Wildlife Island", region: "Bhola", division: "Barishal", district: "Bhola", lat: 21.9167, lng: 90.6667, avgCost: 1200, avgHours: 4.5, type: "Spotted Deer Mangrove Island", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },

  // ===================== KHULNA DIVISION & DISTRICTS =====================
  { id: "spot_karamjal", name: "Karamjal Mangrove & Crocodile Center", region: "Sundarbans", division: "Khulna", district: "Bagerhat", lat: 22.4286, lng: 89.5892, avgCost: 500, avgHours: 3.0, type: "Mangrove Wildlife", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },
  { id: "spot_sixty_dome", name: "Sixty Dome Mosque UNESCO Heritage", region: "Bagerhat", division: "Khulna", district: "Bagerhat", lat: 22.6744, lng: 89.7417, avgCost: 100, avgHours: 2.0, type: "UNESCO Mosque", image: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600" },
  { id: "spot_kotka", name: "Kotka Tiger Wildlife Sanctuary", region: "Sundarbans", division: "Khulna", district: "Bagerhat", lat: 21.8540, lng: 89.7710, avgCost: 1500, avgHours: 5.0, type: "Deep Jungle Safaris", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },
  { id: "spot_lalon_shrine", name: "Fakir Lalon Shah Shrine (Chheuriya)", region: "Kushtia", division: "Khulna", district: "Kushtia", lat: 23.8833, lng: 89.1500, avgCost: 50, avgHours: 2.5, type: "Mystic Baul Shrine", image: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600" },
  { id: "spot_shilaidaha", name: "Rabindranath Tagore Shilaidaha Kuthibari", region: "Kushtia", division: "Khulna", district: "Kushtia", lat: 23.9189, lng: 89.2378, avgCost: 50, avgHours: 2.5, type: "Nobel Laureate Memorial", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" },
  { id: "spot_gadkhali", name: "Gadkhali Valley of Flowers (Flower Capital)", region: "Jashore", division: "Khulna", district: "Jashore", lat: 23.0833, lng: 89.0833, avgCost: 100, avgHours: 2.5, type: "Floral Botanical Valley", image: "https://images.unsplash.com/photo-1518457607834-6e8d80c183c5?w=600" },

  // ===================== RAJSHAHI DIVISION & DISTRICTS =====================
  { id: "spot_paharpur", name: "Somapura Mahavihara (Paharpur UNESCO Monument)", region: "Naogaon", division: "Rajshahi", district: "Naogaon", lat: 25.0315, lng: 88.9769, avgCost: 100, avgHours: 3.5, type: "Buddhist UNESCO Monument", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600" },
  { id: "spot_mahasthangarh", name: "Mahasthangarh Ancient Citadel Ruins", region: "Bogura", division: "Rajshahi", district: "Bogura", lat: 24.9608, lng: 89.3458, avgCost: 80, avgHours: 2.5, type: "Archaeological Citadel", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" },
  { id: "spot_padma_bank", name: "Padma River Waterfront & Sunset Ghat", region: "Rajshahi", division: "Rajshahi", district: "Rajshahi", lat: 24.3636, lng: 88.6000, avgCost: 200, avgHours: 2.0, type: "Riverfront & Boat", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600" },
  { id: "spot_natore_rajbari", name: "Natore Rajbari (Rani Bhabani Palace)", region: "Natore", division: "Rajshahi", district: "Natore", lat: 24.4178, lng: 88.9867, avgCost: 50, avgHours: 2.5, type: "Palatial Lake Estate", image: "https://images.unsplash.com/photo-1584646098378-0874589d76b1?w=600" },
  { id: "spot_uttara_gonobhaban", name: "Uttara Gonobhaban (Dighapatia Royal Palace)", region: "Natore", division: "Rajshahi", district: "Natore", lat: 24.4444, lng: 88.9889, avgCost: 100, avgHours: 2.5, type: "Official State Royal Palace", image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600" }
];

// Haversine Distance in Kilometers
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// 8 Divisions Centers
export const DIVISION_COORDINATES = {
  "dhaka": { lat: 23.8103, lng: 90.4125 },
  "chattogram": { lat: 22.3569, lng: 91.7832 },
  "sylhet": { lat: 24.8949, lng: 91.8687 },
  "khulna": { lat: 22.8456, lng: 89.5403 },
  "rajshahi": { lat: 24.3745, lng: 88.6042 },
  "barishal": { lat: 22.7010, lng: 90.3535 },
  "rangpur": { lat: 25.7439, lng: 89.2752 },
  "mymensingh": { lat: 24.7471, lng: 90.4203 }
};

// 64 Districts GPS Coordinates
export const DISTRICT_COORDINATES = {
  "dhaka": { lat: 23.8103, lng: 90.4125 },
  "gazipur": { lat: 24.0023, lng: 90.4264 },
  "narayanganj": { lat: 23.6238, lng: 90.5000 },
  "tangail": { lat: 24.2513, lng: 89.9167 },
  "kishoreganj": { lat: 24.4449, lng: 90.7766 },
  "manikganj": { lat: 23.8617, lng: 90.0003 },
  "munshiganj": { lat: 23.5422, lng: 90.5305 },
  "narsingdi": { lat: 23.9322, lng: 90.7154 },
  "faridpur": { lat: 23.6071, lng: 89.8429 },
  "gopalganj": { lat: 23.0051, lng: 89.8266 },
  "madaripur": { lat: 23.1641, lng: 90.1897 },
  "rajbari": { lat: 23.7574, lng: 89.6445 },
  "shariatpur": { lat: 23.2423, lng: 90.4348 },
  "chattogram": { lat: 22.3569, lng: 91.7832 },
  "cox's bazar": { lat: 21.4272, lng: 92.0058 },
  "rangamati": { lat: 22.6533, lng: 92.1753 },
  "bandarban": { lat: 22.1953, lng: 92.2184 },
  "khagrachari": { lat: 23.1193, lng: 91.9847 },
  "cumilla": { lat: 23.4682, lng: 91.1788 },
  "feni": { lat: 23.0159, lng: 91.3976 },
  "brahmanbaria": { lat: 23.9571, lng: 91.1119 },
  "noakhali": { lat: 22.8696, lng: 91.0998 },
  "chandpur": { lat: 23.2333, lng: 90.6667 },
  "lakshmipur": { lat: 22.9425, lng: 90.8412 },
  "rajshahi": { lat: 24.3745, lng: 88.6042 },
  "bogura": { lat: 24.8465, lng: 89.3777 },
  "joypurhat": { lat: 25.1015, lng: 89.0270 },
  "naogaon": { lat: 24.7936, lng: 88.9318 },
  "natore": { lat: 24.4206, lng: 88.9324 },
  "chapainawabganj": { lat: 24.5965, lng: 88.2776 },
  "pabna": { lat: 24.0064, lng: 89.2372 },
  "sirajganj": { lat: 24.4534, lng: 89.7008 },
  "khulna": { lat: 22.8456, lng: 89.5403 },
  "jashore": { lat: 23.1664, lng: 89.2081 },
  "satkhira": { lat: 22.7185, lng: 89.0705 },
  "bagerhat": { lat: 22.6602, lng: 89.7895 },
  "kushtia": { lat: 23.9013, lng: 89.1205 },
  "chuadanga": { lat: 23.6402, lng: 88.8418 },
  "meherpur": { lat: 23.7622, lng: 88.6318 },
  "jhenaidah": { lat: 23.5448, lng: 89.1539 },
  "magura": { lat: 23.4873, lng: 89.4199 },
  "narail": { lat: 23.1725, lng: 89.5127 },
  "barishal": { lat: 22.7010, lng: 90.3535 },
  "patuakhali": { lat: 22.3596, lng: 90.3299 },
  "bhola": { lat: 22.6859, lng: 90.6481 },
  "pirojpur": { lat: 22.5841, lng: 89.9720 },
  "barguna": { lat: 22.1570, lng: 90.1256 },
  "jhalokati": { lat: 22.6406, lng: 90.1987 },
  "sylhet": { lat: 24.8949, lng: 91.8687 },
  "moulvibazar": { lat: 24.4829, lng: 91.7774 },
  "habiganj": { lat: 24.3749, lng: 91.4155 },
  "sunamganj": { lat: 25.0658, lng: 91.3950 },
  "rangpur": { lat: 25.7439, lng: 89.2752 },
  "dinajpur": { lat: 25.6217, lng: 88.6355 },
  "gaibandha": { lat: 25.3288, lng: 89.5407 },
  "kurigram": { lat: 25.8054, lng: 89.6362 },
  "lalmonirhat": { lat: 25.9923, lng: 89.2847 },
  "nilphamari": { lat: 25.9318, lng: 88.8560 },
  "panchagarh": { lat: 26.3411, lng: 88.5542 },
  "thakurgaon": { lat: 26.0337, lng: 88.4617 },
  "mymensingh": { lat: 24.7471, lng: 90.4203 },
  "jamalpur": { lat: 24.9375, lng: 89.9378 },
  "netrokona": { lat: 24.8709, lng: 90.7279 },
  "sherpur": { lat: 25.0205, lng: 90.0153 }
};

// Aliases Dictionary for common phonetic variations
export const SPELLING_ALIASES = {
  "chattagram": "chattogram",
  "chittagong": "chattogram",
  "ctg": "chattogram",
  "dacca": "dhaka",
  "coxs bazar": "cox's bazar",
  "coxsbazar": "cox's bazar",
  "cox bazar": "cox's bazar",
  "koxbazar": "cox's bazar",
  "barisal": "barishal",
  "comilla": "cumilla",
  "bogra": "bogura",
  "jessore": "jashore",
  "srimangal": "sreemangal",
  "khagrachhari": "khagrachari",
  "st martin": "saint martin",
  "st. martin": "saint martin",
  "tanguar": "sunamganj",
  "tanguar haor": "sunamganj"
};

/**
 * Normalizes any free-text destination into recognized Division, District, or Tour Place
 */
export function resolveLocationMetadata(rawInput) {
  if (!rawInput) return { name: "Dhaka", type: "city", coords: { lat: 23.8103, lng: 90.4125 } };

  let clean = String(rawInput).trim().toLowerCase();
  clean = clean
    .replace(/\s*\((division|district)\)$/i, "")
    .replace(/\s+(division|district)$/i, "")
    .trim();

  if (SPELLING_ALIASES[clean]) {
    clean = SPELLING_ALIASES[clean];
  }

  // 1. Check if it's an exact or token-matched Tour Place in our database
  const queryTokens = clean.split(/\s+/).filter(Boolean);
  const matchedSpot = REGIONAL_SPOTS.find(s => {
    const sName = s.name.toLowerCase();
    const sReg = (s.region || "").toLowerCase();
    return (
      sName.includes(clean) || clean.includes(sName) ||
      (queryTokens.length > 1 && queryTokens.every(t => sName.includes(t) || sReg.includes(t)))
    );
  });

  if (matchedSpot) {
    return {
      name: matchedSpot.name,
      type: "spot",
      spotId: matchedSpot.id,
      region: matchedSpot.region,
      district: matchedSpot.district,
      division: matchedSpot.division,
      coords: { lat: matchedSpot.lat, lng: matchedSpot.lng }
    };
  }

  // 2. Check if it's ANY of the 64 Districts
  if (DISTRICT_COORDINATES[clean]) {
    const formattedDistrict = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return {
      name: formattedDistrict,
      type: "district",
      district: formattedDistrict,
      coords: DISTRICT_COORDINATES[clean]
    };
  }

  // 3. Check if it's ANY of the 8 Divisions
  if (DIVISION_COORDINATES[clean]) {
    const formattedDivision = clean.charAt(0).toUpperCase() + clean.slice(1);
    return {
      name: `${formattedDivision} Division`,
      type: "division",
      division: formattedDivision,
      coords: DIVISION_COORDINATES[clean]
    };
  }

  // 4. Spot region partial match (e.g. "Sajek", "Inani", "Birishiri", "Kuakata")
  const partialSpot = REGIONAL_SPOTS.find(s => 
    (s.region && s.region.toLowerCase().includes(clean)) || clean.includes((s.region || "").toLowerCase())
  );
  if (partialSpot) {
    return {
      name: partialSpot.region,
      type: "region",
      district: partialSpot.district,
      division: partialSpot.division,
      coords: { lat: partialSpot.lat, lng: partialSpot.lng }
    };
  }

  // Default Fallback
  return {
    name: rawInput.trim(),
    type: "custom",
    coords: { lat: 23.8103, lng: 90.4125 }
  };
}

/**
 * Sequential Chain Router (Traveling Salesperson / Nearest Neighbor)
 * Connects spots in geographic sequence to avoid backtracking
 */
export function buildSequentialChain(startCoord, spots) {
  if (!spots || spots.length === 0) return [];
  const unvisited = [...spots];
  const sequenced = [];
  let currentPos = startCoord;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let shortestDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const d = calculateDistance(currentPos.lat, currentPos.lng, unvisited[i].lat, unvisited[i].lng);
      if (d < shortestDist) {
        shortestDist = d;
        nearestIdx = i;
      }
    }

    const nextSpot = unvisited.splice(nearestIdx, 1)[0];
    sequenced.push({
      ...nextSpot,
      distanceFromPrevKm: shortestDist
    });
    currentPos = { lat: nextSpot.lat, lng: nextSpot.lng };
  }

  return sequenced;
}

/**
 * Detect Terrain Type for a specific transit leg between two locations
 */
export function detectLegTerrain(fromSpot, toSpot) {
  const text = ((fromSpot?.name || "") + " " + (fromSpot?.type || "") + " " + (fromSpot?.region || "") + " " +
                (toSpot?.name || "") + " " + (toSpot?.type || "") + " " + (toSpot?.region || "")).toLowerCase();

  if (text.includes("sajek") || text.includes("nilgiri") || text.includes("boga lake") || text.includes("konglak") || text.includes("chimbuk") || text.includes("chandranath") || text.includes("mountain")) {
    return "hilly";
  }
  if (text.includes("boat cruise") || text.includes("houseboat") || text.includes("speedboat") || text.includes("tanguar") || text.includes("chera dwip") || text.includes("swamp forest boat") || text.includes("floating market")) {
    return "wetland";
  }
  return "normal";
}

/**
 * Real-world Bangladesh Transit Fare & Mode Selector
 * Computes realistic transit mode, distance description, and fare for a specific leg
 */
export function calculateLegTransit(distanceKm, members = 1, isInterCity = false, terrain = "normal", style = "Adventure") {
  const km = Math.max(1, Math.round(distanceKm));
  const count = Math.max(1, parseInt(members, 10) || 1);

  if (isInterCity) {
    if (km > 150) {
      // Long distance highway (e.g. Dhaka to Sajek ~312 km, Dhaka to Sylhet ~240 km, Dhaka to Cox's Bazar ~390 km)
      if (count >= 5 || style === "Luxury") {
        // Reserved AC Microbus / HiAce (cost per vehicle)
        const baseCost = Math.round(km * 28 + 1500);
        return {
          mode: "Reserved AC Microbus (HiAce)",
          details: `Highway transit approx ${km} km (Private Charter)`,
          cost: baseCost,
          isPrivateVehicle: true
        };
      } else {
        // Highway AC / Express Bus (per seat: ~3.0 - 3.5 BDT/km)
        const perSeat = Math.min(1600, Math.max(500, Math.round(km * 3.2)));
        return {
          mode: "AC Highway Express Bus",
          details: `Inter-city highway route approx ${km} km (${perSeat} BDT/seat)`,
          cost: perSeat * count,
          isPrivateVehicle: false
        };
      }
    } else if (km > 50) {
      // Mid distance (e.g. Dhaka to Tangail ~90 km, Chittagong to Sitakunda ~45 km)
      if (count >= 4 || style === "Luxury") {
        const baseCost = Math.round(km * 25 + 800);
        return {
          mode: "Reserved Sedan / Noah",
          details: `Direct highway transit approx ${km} km (Reserved)`,
          cost: baseCost,
          isPrivateVehicle: true
        };
      } else {
        const perSeat = Math.min(650, Math.max(200, Math.round(km * 2.8)));
        return {
          mode: "Regional Express Bus / Inter-district CNG",
          details: `Regional highway transit approx ${km} km`,
          cost: perSeat * count,
          isPrivateVehicle: false
        };
      }
    } else {
      // Short inter-city / suburban (<50 km)
      const cngCount = Math.ceil(count / 4);
      const cost = Math.max(300, Math.round(km * 22)) * cngCount;
      return {
        mode: cngCount > 1 ? `${cngCount}x Reserved CNG Auto-Rickshaws` : "Reserved CNG Auto-Rickshaw",
        details: `Suburban highway transfer approx ${km} km`,
        cost,
        isPrivateVehicle: true
      };
    }
  }

  // Local Intra-Destination Transit
  if (terrain === "hilly") {
    // 4x4 Chander Gari (Jeep) in Sajek / Bandarban / Khagrachari
    const jeepCount = Math.ceil(count / 10);
    const cost = Math.round(Math.min(4500, Math.max(1500, km * 45 + 1200))) * jeepCount;
    return {
      mode: "4x4 Mountain Jeep (Chander Gari)",
      details: `Mountain trail & hilly terrain approx ${km} km`,
      cost,
      isPrivateVehicle: true
    };
  }

  if (terrain === "wetland") {
    // Engine Boat / Speedboat / Troller in Tanguar Haor / Kaptai / Kuakata / Saint Martin
    const boatCost = Math.min(5000, Math.max(800, km * 60 + 600));
    return {
      mode: "Engine Boat / Speedboat Cruise",
      details: `Waterway cruise approx ${km} km`,
      cost: boatCost,
      isPrivateVehicle: true
    };
  }

  // Standard Local Road
  if (km > 20) {
    const cngCount = Math.ceil(count / 4);
    const cost = Math.max(350, Math.round(km * 18)) * cngCount;
    return {
      mode: cngCount > 1 ? `${cngCount}x Reserved CNG Auto-Rickshaws` : "Reserved CNG Auto-Rickshaw",
      details: `Connecting route approx ${km} km`,
      cost,
      isPrivateVehicle: true
    };
  } else if (km > 5) {
    const autoCount = Math.ceil(count / 4);
    const cost = Math.max(120, Math.round(km * 14)) * autoCount;
    return {
      mode: autoCount > 1 ? `${autoCount}x Easy Bike / Electric Autos` : "Easy Bike / Electric Auto",
      details: `Local road transit approx ${km} km`,
      cost,
      isPrivateVehicle: false
    };
  } else {
    const rickshawCount = Math.ceil(count / 2);
    const cost = Math.max(50, Math.round(km * 25)) * rickshawCount;
    return {
      mode: rickshawCount > 1 ? `${rickshawCount}x Local Cycle Rickshaws` : "Local Cycle Rickshaw / Walk",
      details: `Short neighborhood connection approx ${km} km`,
      cost,
      isPrivateVehicle: false
    };
  }
}

/**
 * Smart Budget & Resource Calculator with Itemized Expense Breakdown
 */
export function calculateBudgetBreakdown({
  totalBudget,
  durationDays,
  memberCount,
  totalTransportCost,
  totalActivityCost,
  style = "Adventure"
}) {
  const members = Math.max(1, parseInt(memberCount, 10) || 1);
  const days = Math.max(1, parseInt(durationDays, 10) || 1);
  const nights = Math.max(1, days - 1);
  const roomsNeeded = Math.ceil(members / 2);

  const transportTotal = Math.round(totalTransportCost);
  const activityTotal = Math.round(totalActivityCost);

  // Available remaining budget after required transportation and activities
  const remainingBudget = Math.max(1000, totalBudget - transportTotal - activityTotal);

  let stayPct = style === "Luxury" ? 0.60 : (style === "Budget" ? 0.40 : 0.50);
  let stayTotal = Math.round(remainingBudget * stayPct);
  let foodTotal = Math.max(0, remainingBudget - stayTotal);

  const stayCostPerNight = Math.round(stayTotal / nights);
  const foodPerPersonDaily = Math.round(foodTotal / (members * days));

  return {
    members,
    roomsNeeded,
    nights,
    totalTransportCost: transportTotal,
    stayTotal,
    foodTotal,
    activityTotal,
    stayCostPerNight,
    foodPerPersonDaily,
    expenseBreakdown: [
      { category: "Transport & Transit (Connected Circuit)", amount: transportTotal },
      { category: `Accommodation (${roomsNeeded} Room(s), ${nights} Night(s))`, amount: stayTotal },
      { category: `Food & Dining (${members} Persons, ${days} Days)`, amount: foodTotal },
      { category: "Entry Tickets & Activities", amount: activityTotal }
    ],
    totalEstimated: transportTotal + stayTotal + foodTotal + activityTotal
  };
}

/**
 * Transform Sequenced Spots into Connected LagaTour Tour Plan Stops Schema
 * Connects Starting Destination -> Tour Spots (1..N) -> Ending Destination
 */
export function transformToTourStops({
  sequencedSpots,
  durationDays,
  startingLocation,
  endingLocation,
  startPoint,
  endPoint,
  members,
  style,
  terrain
}) {
  const days = Math.max(1, durationDays);
  const spotsCount = sequencedSpots.length;
  const stops = [];

  // 1. STOP 1: Departure Point / Start Origin
  stops.push({
    id: `ai_stop_start_${Date.now()}`,
    order: 1,
    day: 1,
    placeId: "origin_start",
    placeName: `${startingLocation} (Tour Departure Point)`,
    location: `${startingLocation}, Bangladesh`,
    lat: startPoint.lat,
    lng: startPoint.lng,
    isDeparture: true,
    transportMode: "Meetup & Departure",
    transportDetails: `Expedition assembly and check-in at ${startingLocation}`,
    transportCost: 0,
    accommodationCost: 0,
    expense: 0,
    totalCost: 0,
    hasAccommodation: false,
    accommodationType: "",
    accommodationName: "",
    accommodationDetails: "",
    stayDuration: "1 Hour",
    notes: `Day 1 - Gather with companions at ${startingLocation} and embark on tour circuit.`,
    status: "pending",
    photos: ["https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600"]
  });

  // Distribute intermediate attractions across the days
  const spotsPerDay = Math.ceil(spotsCount / days);

  // 2. STOPS 2..N: Sequenced Attractions
  sequencedSpots.forEach((spot, idx) => {
    const stopOrder = idx + 2;
    const dayNumber = Math.min(days, Math.floor(idx / spotsPerDay) + 1);
    const isOvernightStop = (idx % spotsPerDay === spotsPerDay - 1) && dayNumber < days;

    let legTransit;
    if (idx === 0) {
      // First leg: Starting point to first attraction
      const distFromStart = calculateDistance(startPoint.lat, startPoint.lng, spot.lat, spot.lng);
      const legTerrain = detectLegTerrain({ name: startingLocation }, spot);
      legTransit = calculateLegTransit(distFromStart, members, distFromStart > 30, legTerrain, style);
      legTransit.details = `Departure transit from ${startingLocation} to ${spot.name} (${Math.round(distFromStart)} km)`;
    } else {
      const prevSpot = sequencedSpots[idx - 1];
      const distFromPrev = calculateDistance(prevSpot.lat, prevSpot.lng, spot.lat, spot.lng);
      const legTerrain = detectLegTerrain(prevSpot, spot);
      legTransit = calculateLegTransit(distFromPrev, members, false, legTerrain, style);
      legTransit.details = `Local transit from ${prevSpot.name} to ${spot.name} (${Math.round(distFromPrev)} km)`;
    }

    const stayCost = isOvernightStop ? 2500 : 0;
    const stopTotalCost = legTransit.cost + stayCost;

    stops.push({
      id: `ai_stop_${Date.now()}_${idx + 1}`,
      order: stopOrder,
      day: dayNumber,
      placeId: spot.id,
      placeName: spot.name,
      location: `${spot.region || spot.district || 'Scenic Spot'}, ${spot.district || 'Bangladesh'}`,
      lat: spot.lat,
      lng: spot.lng,
      transportMode: legTransit.mode,
      transportDetails: legTransit.details,
      transportCost: legTransit.cost,
      hasAccommodation: isOvernightStop,
      accommodationType: "Deluxe Hotel / Resort",
      accommodationName: `${spot.region || spot.district || 'Central'} Stay`,
      accommodationCost: stayCost,
      accommodationDetails: `${Math.ceil(members / 2)} room(s) arranged for ${members} travelers`,
      stayDuration: isOvernightStop ? "1 Night" : `${spot.avgHours || 2.5} Hours`,
      notes: spot.communityNotes
        ? `Day ${dayNumber} - ${spot.communityNotes} (Recommended in community plan by ${spot.communityAuthor || 'traveler'})`
        : `Day ${dayNumber} - ${spot.type || 'Sightseeing'}. Estimated exploration ${spot.avgHours || 2} hours.`,
      status: "pending",
      photos: [spot.image],
      expense: stopTotalCost,
      totalCost: stopTotalCost,
      isCommunityRecommended: Boolean(spot.isCommunityRecommended),
      communityPlanTitle: spot.communityPlanTitle || null,
      communityAuthor: spot.communityAuthor || null,
      discoveryBadge: spot.isCommunityRecommended ? "Community Pick" : ""
    });
  });

  // 3. FINAL STOP: Return Leg to Ending Destination
  const lastSpot = sequencedSpots[spotsCount - 1] || { lat: startPoint.lat, lng: startPoint.lng, name: startingLocation };
  const distToEnd = calculateDistance(lastSpot.lat, lastSpot.lng, endPoint.lat, endPoint.lng);
  const retTerrain = detectLegTerrain(lastSpot, { name: endingLocation });
  const retTransit = calculateLegTransit(distToEnd, members, distToEnd > 30, retTerrain, style);
  retTransit.details = `Return transit from ${lastSpot.name} back to ${endingLocation} (${Math.round(distToEnd)} km)`;

  stops.push({
    id: `ai_stop_return_${Date.now()}`,
    order: stops.length + 1,
    day: days,
    placeId: "origin_return",
    placeName: `Return to ${endingLocation} (Trip Conclusion)`,
    location: `${endingLocation}, Bangladesh`,
    lat: endPoint.lat,
    lng: endPoint.lng,
    isReturn: true,
    transportMode: retTransit.mode,
    transportDetails: retTransit.details,
    transportCost: retTransit.cost,
    hasAccommodation: false,
    accommodationType: "",
    accommodationName: "",
    accommodationCost: 0,
    accommodationDetails: "",
    stayDuration: "Tour Complete",
    notes: `Day ${days} - Journey back to ${endingLocation}, safely completing the round-trip expedition circuit.`,
    status: "pending",
    photos: ["https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600"],
    expense: retTransit.cost,
    totalCost: retTransit.cost
  });

  return stops;
}

/**
 * Query MySQL database for existing community tour plans matching the search.
 * Extracts proven routes, traveler tips, visited spots, and community ideas.
 */
export async function fetchCommunityTourPlanIdeas({
  destination = "",
  startingLocation = "",
  division = "",
  district = ""
}) {
  const ideas = {
    matchedPlans: [],
    communitySpots: [],
    communityTips: [],
    communityInspirations: [],
    preferredTransport: null
  };

  try {
    const keywords = new Set();
    if (destination) {
      destination.split(/[\s,&/-]+/).forEach(k => {
        const clean = k.trim().toLowerCase();
        if (clean.length > 2 && !['and', 'the', 'tour', 'trip', 'circuit', 'valley', 'beach', 'lake'].includes(clean)) {
          keywords.add(clean);
        }
      });
      keywords.add(destination.trim().toLowerCase());
    }
    if (district) keywords.add(district.trim().toLowerCase());
    if (division) keywords.add(division.trim().toLowerCase());

    const keywordArray = Array.from(keywords);
    if (keywordArray.length === 0) return ideas;

    const whereClauses = [];
    const queryParams = [];

    keywordArray.forEach(kw => {
      whereClauses.push("(LOWER(p.destination) LIKE ? OR LOWER(p.title) LIKE ? OR LOWER(p.description) LIKE ?)");
      const term = `%${kw}%`;
      queryParams.push(term, term, term);
    });

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
      WHERE ${whereClauses.join(" OR ")}
      ORDER BY p.rating_avg DESC, p.likes_count DESC, p.views_count DESC
      LIMIT 4
    `;

    const plans = await query(sql, queryParams);
    if (!Array.isArray(plans) || plans.length === 0) {
      return ideas;
    }

    ideas.matchedPlans = plans;

    const planIds = plans.map(p => p.tour_plan_id);
    for (const p of plans) {
      const authorName = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.username || "LagaTour Explorer";
      const rating = Number(p.rating_avg || 4.9);
      const likes = Number(p.likes_count || 0);

      let keyIdea = "";
      if (p.travel_tips) {
        keyIdea = p.travel_tips.slice(0, 140);
        ideas.communityTips.push({
          sourcePlan: p.title,
          author: authorName,
          tip: p.travel_tips
        });
      } else if (p.description) {
        keyIdea = p.description.slice(0, 120);
      }

      ideas.communityInspirations.push({
        id: p.tour_plan_id,
        title: p.title,
        destination: p.destination,
        startingLocation: p.starting_location,
        durationDays: p.duration_days,
        authorName,
        authorAvatar: p.profile_picture_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${authorName}`,
        rating,
        likes,
        keyIdea: keyIdea || "Popular scenic route curated by traveler community",
        tips: p.travel_tips || null,
        transportation: p.transportation || "Bus"
      });

      if (!ideas.preferredTransport && p.transportation) {
        ideas.preferredTransport = p.transportation;
      }
    }

    // Query tour_plan_places_modified for spots visited in these community plans
    if (planIds.length > 0) {
      const placeholders = planIds.map(() => "?").join(",");
      const stopsRows = await query(
        `SELECT * FROM tour_plan_places_modified WHERE tour_plan_id IN (${placeholders}) ORDER BY stop_order ASC`,
        planIds
      );

      if (Array.isArray(stopsRows) && stopsRows.length > 0) {
        for (const s of stopsRows) {
          if (!s.place_name || !s.latitude || !s.longitude) continue;
          
          let parsedPhotos = [];
          if (s.photos) {
            try {
              parsedPhotos = typeof s.photos === "string" ? JSON.parse(s.photos) : s.photos;
            } catch (e) {
              parsedPhotos = [];
            }
          }

          const matchedPlan = plans.find(p => p.tour_plan_id === s.tour_plan_id);
          const authorName = matchedPlan ? ([matchedPlan.first_name, matchedPlan.last_name].filter(Boolean).join(" ") || matchedPlan.username) : "Traveler";

          ideas.communitySpots.push({
            id: `comm_${s.tour_plan_place_id || Date.now()}`,
            name: s.place_name,
            region: s.location || destination,
            district: s.location || destination,
            division: "Bangladesh",
            lat: Number(s.latitude),
            lng: Number(s.longitude),
            avgCost: Number(s.transport_cost || 100),
            avgHours: 2.5,
            type: s.notes ? s.notes.slice(0, 35) : "Community Favorite Spot",
            image: (parsedPhotos && parsedPhotos[0]) || "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600",
            isCommunityRecommended: true,
            communityPlanTitle: matchedPlan?.title || "Community Tour Plan",
            communityAuthor: authorName,
            communityNotes: s.notes || ""
          });
        }
      }
    }

  } catch (err) {
    console.warn("fetchCommunityTourPlanIdeas error (falling back gracefully):", err.message);
  }

  return ideas;
}

/**
 * Main AI Engine: Generates Comparison Plans for ANY Division, ANY District, or ANY Tour Place
 */
export async function generateTourPlans({
  mode = "destination", // "destination" | "nearby"
  destination = "Dhaka",
  startingLocation = "Dhaka",
  endingLocation = null,
  userGps = null,
  duration = 3,
  budget = 18000,
  members = 2,
  style = "Adventure"
}) {
  const durationDays = parseInt(duration, 10) || 3;
  const totalBudget = parseInt(budget, 10) || 15000;
  const memberCount = parseInt(members, 10) || 1;

  const resolvedStartingLocation = startingLocation || "Dhaka";
  const resolvedEndingLocation = endingLocation || startingLocation || "Dhaka";

  // 1. Resolve Origin Coordinates
  const originMetadata = resolveLocationMetadata(startingLocation);
  const startPoint = (userGps && userGps.lat) ? userGps : originMetadata.coords;

  // 2. Fetch existing community tour plan ideas and traveler tips from MySQL Database
  const communityIdeas = await fetchCommunityTourPlanIdeas({
    destination,
    startingLocation: resolvedStartingLocation
  });

  // 3. Fetch any user-created places from MySQL Database and merge community spots
  let combinedSpots = [...REGIONAL_SPOTS];
  if (communityIdeas.communitySpots.length > 0) {
    for (const commSpot of communityIdeas.communitySpots) {
      if (!combinedSpots.some(s => s.name.toLowerCase() === commSpot.name.toLowerCase() || (Math.abs(s.lat - commSpot.lat) < 0.005 && Math.abs(s.lng - commSpot.lng) < 0.005))) {
        combinedSpots.unshift(commSpot);
      }
    }
  }

  try {
    const dbPlaces = await query("SELECT place_id, place_name, division, district, latitude, longitude, description FROM places WHERE is_public = 1");
    if (Array.isArray(dbPlaces) && dbPlaces.length > 0) {
      for (const p of dbPlaces) {
        if (!combinedSpots.some(s => s.id === p.place_id || s.name.toLowerCase() === p.place_name.toLowerCase())) {
          combinedSpots.push({
            id: p.place_id,
            name: p.place_name,
            region: p.district || p.division || "Scenic Spot",
            division: p.division || "Bangladesh",
            district: p.district || "Bangladesh",
            lat: Number(p.latitude),
            lng: Number(p.longitude),
            avgCost: 100,
            avgHours: 2.5,
            type: "Community Scenic Spot",
            image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600"
          });
        }
      }
    }
  } catch (err) {
    // Non-fatal if database is busy
  }

  let candidateSpots = [];
  let resolvedDestinationName = destination;
  let destinationAnchorCoord = startPoint;
  let targetMeta = null;

  if (mode === "nearby") {
    // Mode 2: Find spots nearby user's starting location
    const scoredSpots = combinedSpots.map(s => ({
      ...s,
      distFromOrigin: calculateDistance(startPoint.lat, startPoint.lng, s.lat, s.lng)
    })).sort((a, b) => a.distFromOrigin - b.distFromOrigin);

    candidateSpots = scoredSpots.slice(0, Math.min(10, Math.max(4, durationDays * 3)));
    resolvedDestinationName = candidateSpots[0]?.region || candidateSpots[0]?.district || "Nearby Expedition";
    destinationAnchorCoord = startPoint;

  } else {
    // Mode 1: Destination-based (Can be ANY Division, ANY District, or ANY Tour Place)
    targetMeta = resolveLocationMetadata(destination);
    resolvedDestinationName = targetMeta.name;
    destinationAnchorCoord = targetMeta.coords;

    if (targetMeta.type === "spot") {
      // User entered a specific tour place (e.g. Sajek Valley, Kantaji Mandir, Mohamaya Lake, Nikli Haor)
      const anchorSpot = combinedSpots.find(s => s.id === targetMeta.spotId) || targetMeta;
      
      // Find neighboring spots within 90 km of this anchor spot
      const nearbyToSpot = combinedSpots
        .filter(s => s.id !== targetMeta.spotId)
        .map(s => ({
          ...s,
          distToAnchor: calculateDistance(targetMeta.coords.lat, targetMeta.coords.lng, s.lat, s.lng)
        }))
        .filter(s => s.distToAnchor <= 95)
        .sort((a, b) => a.distToAnchor - b.distToAnchor);

      // Anchor spot is GUARANTEED to be in the itinerary!
      candidateSpots = [anchorSpot, ...nearbyToSpot];

    } else if (targetMeta.type === "district") {
      // User entered ANY of the 64 districts (e.g. Tangail, Panchagarh, Dinajpur, Bandarban, Kushtia)
      const districtClean = targetMeta.district.toLowerCase();
      const inDistrictSpots = combinedSpots.filter(s =>
        (s.district && s.district.toLowerCase() === districtClean) ||
        (s.region && s.region.toLowerCase() === districtClean)
      );

      // If less than 4 spots in this specific district, check if there are spots in the same division
      if (inDistrictSpots.length < 4) {
        const inDivSpots = combinedSpots.filter(s =>
          s.division && s.division.toLowerCase() === districtClean &&
          !inDistrictSpots.some(inS => inS.id === s.id)
        );
        inDistrictSpots.push(...inDivSpots);
      }

      // Also get adjacent spots within 80 km of district center
      const adjacentSpots = combinedSpots
        .filter(s => !inDistrictSpots.some(inS => inS.id === s.id))
        .map(s => ({
          ...s,
          distToCenter: calculateDistance(targetMeta.coords.lat, targetMeta.coords.lng, s.lat, s.lng)
        }))
        .filter(s => s.distToCenter <= 80)
        .sort((a, b) => a.distToCenter - b.distToCenter);

      // Sequence in-district spots first so they take strict priority
      if (inDistrictSpots.length > 0) {
        const sequencedInDistrict = buildSequentialChain(targetMeta.coords, inDistrictSpots);
        const lastInDistrict = sequencedInDistrict[sequencedInDistrict.length - 1];
        const remainingSpots = adjacentSpots.slice(0, 4);
        const sequencedAdjacent = remainingSpots.length > 0
          ? buildSequentialChain({ lat: lastInDistrict.lat, lng: lastInDistrict.lng }, remainingSpots)
          : [];
        candidateSpots = [...sequencedInDistrict, ...sequencedAdjacent];
      } else {
        candidateSpots = adjacentSpots.slice(0, 8);
      }

    } else if (targetMeta.type === "division") {
      // User entered ANY of the 8 divisions (e.g. Rangpur, Barishal, Rajshahi, Sylhet, Khulna)
      const divClean = targetMeta.division.toLowerCase();
      const inDivisionSpots = combinedSpots.filter(s =>
        (s.division && s.division.toLowerCase().includes(divClean)) ||
        (s.region && s.region.toLowerCase().includes(divClean))
      );

      if (inDivisionSpots.length >= 2) {
        candidateSpots = inDivisionSpots;
      } else {
        const nearbyDivSpots = combinedSpots.map(s => ({
          ...s,
          distToDiv: calculateDistance(targetMeta.coords.lat, targetMeta.coords.lng, s.lat, s.lng)
        })).sort((a, b) => a.distToDiv - b.distToDiv);

        candidateSpots = nearbyDivSpots.slice(0, 8);
      }

    } else {
      // Custom place / generic search
      const scoredSpots = combinedSpots.map(s => ({
        ...s,
        distToDest: calculateDistance(targetMeta.coords.lat, targetMeta.coords.lng, s.lat, s.lng)
      })).sort((a, b) => a.distToDest - b.distToDest);

      candidateSpots = scoredSpots.slice(0, 8);
    }
  }

  // 3. Resolve Ending Destination Coordinates (Ensures Starting & Ending Destinations are Connected)
  const endingMetadata = resolveLocationMetadata(resolvedEndingLocation);
  const endPoint = endingMetadata.coords;

  // Build Sequence: Preserve district-prioritized sequence or sequence around destination anchor
  const allSequencedSpots = (typeof targetMeta !== "undefined" && targetMeta?.type === "district")
    ? candidateSpots
    : buildSequentialChain(destinationAnchorCoord, candidateSpots);

  // OPTION A: Max Spots Explorer (Packs maximum spots feasible into duration & budget)
  const maxSpotsTargetCount = Math.min(allSequencedSpots.length, Math.max(3, durationDays * 2));
  const spotsOptionA = allSequencedSpots.slice(0, maxSpotsTargetCount);
  const stopsA = transformToTourStops({
    sequencedSpots: spotsOptionA,
    durationDays,
    startingLocation: resolvedStartingLocation,
    endingLocation: resolvedEndingLocation,
    startPoint,
    endPoint,
    members: memberCount,
    style
  });

  const totalTransportA = stopsA.reduce((sum, s) => sum + (Number(s.transportCost) || 0), 0);
  const totalActivityA = spotsOptionA.reduce((sum, s) => sum + (Number(s.avgCost) || 0) * memberCount, 0);
  const budgetSplitsA = calculateBudgetBreakdown({
    totalBudget,
    durationDays,
    memberCount,
    totalTransportCost: totalTransportA,
    totalActivityCost: totalActivityA,
    style
  });

  // OPTION B: Relaxed & Scenic (Packs top 3-4 highlights with slower pace & leisurely stays)
  const relaxedTargetCount = Math.min(allSequencedSpots.length, Math.max(2, durationDays + 1));
  const spotsOptionB = allSequencedSpots.slice(0, relaxedTargetCount);
  const stopsB = transformToTourStops({
    sequencedSpots: spotsOptionB,
    durationDays,
    startingLocation: resolvedStartingLocation,
    endingLocation: resolvedEndingLocation,
    startPoint,
    endPoint,
    members: memberCount,
    style: "Luxury"
  });

  const totalTransportB = stopsB.reduce((sum, s) => sum + (Number(s.transportCost) || 0), 0);
  const totalActivityB = spotsOptionB.reduce((sum, s) => sum + (Number(s.avgCost) || 0) * memberCount, 0);
  const budgetSplitsB = calculateBudgetBreakdown({
    totalBudget,
    durationDays,
    memberCount,
    totalTransportCost: totalTransportB,
    totalActivityCost: totalActivityB,
    style: "Luxury"
  });

  // Generate Connected Itinerary Descriptions
  const itineraryDaysA = [];
  const itineraryDaysB = [];

  for (let d = 1; d <= durationDays; d++) {
    const dayStopsA = stopsA.filter(s => s.day === d);
    const spotNamesA = dayStopsA.filter(s => !s.isDeparture && !s.isReturn).map(s => s.placeName).join(" ➔ ");
    const isFirstDay = d === 1;
    const isLastDay = d === durationDays;

    itineraryDaysA.push({
      day: `Day ${d}`,
      title: isFirstDay 
        ? `Departure from ${resolvedStartingLocation} ➔ ${resolvedDestinationName}`
        : (isLastDay 
          ? `Sightseeing Highlights ➔ Return to ${resolvedEndingLocation}`
          : (dayStopsA[0]?.placeName || `Explore ${resolvedDestinationName}`)),
      plan: isFirstDay
        ? `Assemble at ${resolvedStartingLocation} and depart via ${stopsA[1]?.transportMode || 'AC Bus'}. Sightseeing covering ${spotNamesA || resolvedDestinationName}.`
        : (isLastDay
          ? `Final excursion at ${spotNamesA || resolvedDestinationName}, followed by ${stopsA[stopsA.length - 1]?.transportMode || 'return coach'} journey back to ${resolvedEndingLocation}.`
          : `Active exploration covering ${dayStopsA.length} spot(s): ${spotNamesA}. Transit via ${dayStopsA[0]?.transportMode || 'Local Transit'}.`)
    });

    const dayStopsB = stopsB.filter(s => s.day === d);
    const spotNamesB = dayStopsB.filter(s => !s.isDeparture && !s.isReturn).map(s => s.placeName).join(" & ");

    itineraryDaysB.push({
      day: `Day ${d}`,
      title: isFirstDay
        ? `Scenic Journey from ${resolvedStartingLocation} to ${resolvedDestinationName}`
        : (isLastDay
          ? `Leisurely Excursion & Return to ${resolvedEndingLocation}`
          : (dayStopsB[0]?.placeName || `Scenic Leisure`)),
      plan: isFirstDay
        ? `Relaxed departure from ${resolvedStartingLocation} via ${stopsB[1]?.transportMode || 'Reserved Vehicle'} with scenic stops en route to ${resolvedDestinationName}.`
        : (isLastDay
          ? `Morning stroll and photography at ${spotNamesB || resolvedDestinationName}, then return comfortably to ${resolvedEndingLocation}.`
          : `Leisurely exploration at ${spotNamesB}. Ample time for photography, local cafes, and sunset views.`)
    });
  }

  const planOptionA = {
    planId: "opt_max_spots",
    planType: "max_spots",
    badgeTitle: "⚡ Max Spots Explorer",
    badgeColor: "primary",
    summary: `Complete connected circuit from ${resolvedStartingLocation} to ${resolvedDestinationName} and return to ${resolvedEndingLocation}, covering ${spotsOptionA.length} top spots with all transit costs included.`,
    title: `AI Explorer: ${durationDays} Days ${resolvedDestinationName} Connected Circuit`,
    destination: resolvedDestinationName,
    startingLocation: resolvedStartingLocation,
    endingLocation: resolvedEndingLocation,
    connectedCircuit: true,
    totalTransportCost: totalTransportA,
    totalCost: budgetSplitsA.totalEstimated,
    totalEstimatedCost: budgetSplitsA.totalEstimated,
    stayTotal: budgetSplitsA.stayTotal,
    foodTotal: budgetSplitsA.foodTotal,
    activityTotal: budgetSplitsA.activityTotal,
    roomsNeeded: budgetSplitsA.roomsNeeded,
    nights: budgetSplitsA.nights,
    durationDays: durationDays,
    targetBudget: totalBudget,
    travelType: memberCount > 2 ? "Group" : (memberCount === 2 ? "Couple" : "Solo"),
    memberCount: memberCount,
    pace: "Fast-Paced (High Energy)",
    spotsCount: stopsA.length,
    transportation: `${stopsA[1]?.transportMode || 'AC Highway Bus'} & Local Transit`,
    accommodationType: budgetSplitsA.roomsNeeded > 1 ? `${budgetSplitsA.roomsNeeded} Standard Rooms` : "Standard Hotel",
    stops: stopsA,
    expenseBreakdown: budgetSplitsA.expenseBreakdown,
    itinerary: itineraryDaysA,
    communityInspirations: communityIdeas.communityInspirations,
    hasCommunityIdeas: communityIdeas.communityInspirations.length > 0,
    tips: communityIdeas.communityTips.length > 0
      ? `All departure, local inter-spot, and return transportation costs are fully accounted for. Depart from ${resolvedStartingLocation} early. 💡 Community Traveler Advice: "${communityIdeas.communityTips[0].tip}" (— ${communityIdeas.communityTips[0].author}, from "${communityIdeas.communityTips[0].sourcePlan}")`
      : `All departure, local inter-spot, and return transportation costs are fully accounted for. Depart from ${resolvedStartingLocation} early to maximize sightseeing time.`
  };

  const planOptionB = {
    planId: "opt_relaxed",
    planType: "relaxed",
    badgeTitle: "🌿 Relaxed & Scenic",
    badgeColor: "secondary",
    summary: `Comfortable connected getaway from ${resolvedStartingLocation} to ${resolvedDestinationName} and return to ${resolvedEndingLocation}, with premium transit and deluxe resort stays.`,
    title: `AI Leisure: ${durationDays} Days Scenic ${resolvedDestinationName} Getaway`,
    destination: resolvedDestinationName,
    startingLocation: resolvedStartingLocation,
    endingLocation: resolvedEndingLocation,
    connectedCircuit: true,
    totalTransportCost: totalTransportB,
    totalCost: budgetSplitsB.totalEstimated,
    totalEstimatedCost: budgetSplitsB.totalEstimated,
    stayTotal: budgetSplitsB.stayTotal,
    foodTotal: budgetSplitsB.foodTotal,
    activityTotal: budgetSplitsB.activityTotal,
    roomsNeeded: budgetSplitsB.roomsNeeded,
    nights: budgetSplitsB.nights,
    durationDays: durationDays,
    targetBudget: totalBudget,
    travelType: memberCount > 2 ? "Family" : "Friends",
    memberCount: memberCount,
    pace: "Leisurely (Low Stress)",
    spotsCount: stopsB.length,
    transportation: communityIdeas.preferredTransport
      ? `${communityIdeas.preferredTransport} & Scenic Resort Transfers`
      : "Reserved Sedan / AC Van & Resort Transfers",
    accommodationType: `${budgetSplitsB.roomsNeeded} Deluxe Resort Room(s)`,
    stops: stopsB,
    expenseBreakdown: budgetSplitsB.expenseBreakdown,
    itinerary: itineraryDaysB,
    communityInspirations: communityIdeas.communityInspirations,
    hasCommunityIdeas: communityIdeas.communityInspirations.length > 0,
    tips: communityIdeas.communityTips.length > 0
      ? `Full round-trip transit and local transfers to ${resolvedEndingLocation} are accounted for. 💡 Community Secret: "${communityIdeas.communityTips[0].tip}" (— ${communityIdeas.communityTips[0].author})`
      : `Full round-trip transit and local transfers to ${resolvedEndingLocation} are accounted for. Enjoy sunset viewpoints and traditional delicacies.`
  };

  return {
    success: true,
    mode,
    searchedDestination: resolvedDestinationName,
    durationDays,
    memberCount,
    communityInspirations: communityIdeas.communityInspirations,
    hasCommunityIdeas: communityIdeas.communityInspirations.length > 0,
    plans: [planOptionA, planOptionB]
  };
}
