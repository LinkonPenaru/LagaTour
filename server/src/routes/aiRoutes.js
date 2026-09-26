import express from "express";
import { buildTourPackage } from "../controllers/aiController.js";

const router = express.Router();

// Generate dual AI tour packages (Database-grounded vs. Web-grounded)
router.post("/build-package", buildTourPackage);

export default router;
