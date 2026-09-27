import { generateTourPackagesWithAI } from "../services/aiService.js";

/**
 * POST /api/ai/build-package
 * Accepts user travel specifications and returns dual AI packages:
 * 1) Local DB Grounded package
 * 2) Web Explorer & Hidden Gems package
 */
export async function buildTourPackage(req, res) {
  try {
    const {
      startingLocation = "Dhaka",
      destination = "Cox's Bazar",
      duration = 3,
      budget = 15000,
      travelStyle = "Adventure",
      transportation = "AC Bus"
    } = req.body;

    if (!destination || destination.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Destination is required."
      });
    }

    const packages = await generateTourPackagesWithAI({
      startingLocation,
      destination,
      duration: parseInt(duration, 10) || 3,
      budget: parseInt(budget, 10) || 15000,
      travelStyle,
      transportation
    });

    return res.json({
      success: true,
      databaseSuggestion: packages.databaseSuggestion,
      webSuggestion: packages.webSuggestion
    });
  } catch (error) {
    console.error("Error in buildTourPackage controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate AI tour package: " + error.message
    });
  }
}
