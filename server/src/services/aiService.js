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

