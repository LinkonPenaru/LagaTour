import express from "express";
import { buildTourPackage } from "../controllers/aiController.js";
import { generateTourPlans } from "../services/aiService.js";

const router = express.Router();

// Generate dual AI tour packages (Database-grounded vs. Web-grounded with Gemini)
router.post("/build-package", buildTourPackage);

/**
 * POST /api/ai/generate-plans
 */
router.post("/generate-plans", async (req, res) => {
  try {
    const {
      mode = "destination",
      destination = "Sajek Valley",
      startingLocation = "Dhaka",
      endingLocation = null,
      userGps = null,
      duration = 3,
      budget = 18000,
      members = 2,
      style = "Adventure"
    } = req.body;

    const result = await generateTourPlans({
      mode,
      destination,
      startingLocation,
      endingLocation,
      userGps,
      duration,
      budget,
      members,
      style
    });

    res.json(result);
  } catch (error) {
    console.error("AI Plan Generation Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate AI tour plans"
    });
  }
});

export default router;
