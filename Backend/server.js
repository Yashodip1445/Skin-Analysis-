import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import mongoose from 'mongoose';
import Analysis from './models/Analysis.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Multer memory storage (we'll convert to base64 inline for Gemini)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max here (adjust as needed)
});

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skin-ai';

// Connect to MongoDB (optional; server will still run without DB)
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected')).catch(err => console.warn('MongoDB connection failed:', err.message));

// Initialize Gemini client
// The SDK will also read GEMINI_API_KEY env var; we pass explicitly for clarity.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Helper: call Gemini with retries and exponential backoff
async function generateWithRetry(params, retries = 3, initialDelay = 1000) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const resp = await ai.models.generateContent(params);
      // Log trimmed response for debugging (avoid huge outputs)
      try {
        console.log('Gemini response (trim):', JSON.stringify(resp).slice(0, 2000));
      } catch (e) {
        console.log('Gemini response received');
      }
      return resp;
    } catch (err) {
      attempt++;
      const msg = err?.message || err?.toString?.() || String(err);
      console.error(`Gemini call failed (attempt ${attempt}/${retries}):`, msg);
      // If last attempt, rethrow
      if (attempt >= retries) throw err;
      // Exponential backoff
      const delay = initialDelay * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Example health route
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Return a curated list of common facial skin conditions and key symptoms
app.get('/common-conditions', (req, res) => {
  const conditions = [
    {
      id: 'acne',
      name: 'Acne',
      symptoms: ['whiteheads', 'blackheads', 'pustules', 'nodules', 'inflammation'],
      short: 'Common in teens and adults; inflammatory and non-inflammatory lesions.'
    },
    {
      id: 'eczema',
      name: 'Eczema (Atopic Dermatitis)',
      symptoms: ['dryness', 'itching', 'red patches', 'crusting', 'flare-ups'],
      short: 'Chronic itchy rash often linked to allergies or sensitive skin.'
    },
    {
      id: 'rosacea',
      name: 'Rosacea',
      symptoms: ['facial redness', 'visible blood vessels', 'bumps', 'flushing'],
      short: 'Persistent redness, may worsen with triggers (heat, alcohol, spicy foods).'
    },
    {
      id: 'melasma',
      name: 'Melasma',
      symptoms: ['patchy brown/gray-brown pigmentation', 'symmetrical spots'],
      short: 'Hormone-related hyperpigmentation, common on cheeks and forehead.'
    },
    {
      id: 'psoriasis',
      name: 'Psoriasis',
      symptoms: ['thick red plaques', 'silvery scales', 'itching'],
      short: 'Autoimmune-related scaly plaques; can affect the face and scalp.'
    },
    {
      id: 'contact_dermatitis',
      name: 'Contact Dermatitis',
      symptoms: ['redness', 'blisters', 'itching', 'burning'],
      short: 'Skin reaction to irritants or allergens (cosmetics, metals, fragrances).'
    },
    {
      id: 'fungal_infection',
      name: 'Fungal Infection (Tinea)',
      symptoms: ['ring-like patches', 'scaling', 'red border'],
      short: 'Often presents as circular, scaly patches; requires antifungal treatment.'
    },
    {
      id: 'sun_damage',
      name: 'Sun Damage / Photoaging',
      symptoms: ['wrinkles', 'pigmentation', 'rough texture', 'telangiectasia'],
      short: 'Chronic sun exposure leads to visible aging and spots.'
    },
    {
      id: 'perioral_dermatitis',
      name: 'Perioral Dermatitis',
      symptoms: ['small red papules around mouth/nose', 'scaling'],
      short: 'Red papules often around the mouth; can be triggered by topical steroids.'
    },
    {
      id: 'hyperpigmentation',
      name: 'Post-Inflammatory Hyperpigmentation',
      symptoms: ['flat dark spots', 'leftover marks after inflammation'],
      short: 'Dark spots remaining after acne or injury; cosmetic concern more than active disease.'
    }
  ];

  res.json({ success: true, conditions });
});

// CRUD endpoints for analyses
// Create an analysis entry
app.post('/api/analyses', async (req, res) => {
  try {
    const { imageName, result, notes, referToDerm } = req.body;
    const a = new Analysis({ imageName, result, notes, referToDerm });
    const saved = await a.save();
    res.json({ success: true, analysis: saved });
  } catch (err) {
    console.error('Create analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// List analyses
app.get('/api/analyses', async (req, res) => {
  try {
    const list = await Analysis.find().sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, analyses: list });
  } catch (err) {
    console.error('List analyses error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single analysis
app.get('/api/analyses/:id', async (req, res) => {
  try {
    const item = await Analysis.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, analysis: item });
  } catch (err) {
    console.error('Get analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update analysis
app.put('/api/analyses/:id', async (req, res) => {
  try {
    const updated = await Analysis.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, analysis: updated });
  } catch (err) {
    console.error('Update analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete analysis
app.delete('/api/analyses/:id', async (req, res) => {
  try {
    const removed = await Analysis.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete analysis error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/assistant - proxy a text prompt to Gemini and return the model reply
app.post('/api/assistant', async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ success: false, error: 'Missing prompt' });

    // Build a safe system prompt to guide replies
    const systemPrompt = `You are a helpful, accurate, and cautious dermatology assistant. Provide clear, non-prescriptive information. If the user requests medical advice, include a disclaimer to consult a dermatologist.`;

    const contents = [
      { text: systemPrompt },
      { text: prompt }
    ];

    try {
      const response = await generateWithRetry({ model: 'gemini-2.5-flash', contents });
      const text = response?.text ?? JSON.stringify(response);
      return res.json({ success: true, text });
    } catch (err) {
      console.error('Assistant final error:', err?.message || err);
      // Fallback mock reply when model is unavailable
      const mock = "I'm temporarily unable to reach the AI model. Here are some general skin care tips: keep skin clean, avoid picking lesions, use gentle sunscreen, and consult a dermatologist for persistent issues.";
      return res.status(503).json({ success: false, error: 'model unavailable', text: mock });
    }
  } catch (err) {
    console.error('Assistant error:', err);
    return res.status(500).json({ success: false, error: err.message || 'assistant error' });
  }
});

/**
 * POST /api/analyze-image
 * form-data field: "image" (file)
 * returns: parsed JSON result from Gemini (or raw text if parsing fails)
 */
app.post("/api/analyze-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const mimeType = req.file.mimetype || "image/jpeg";
    const base64 = req.file.buffer.toString("base64");

    // Prompt: instruct Gemini to return JSON ONLY with specific fields.
    // IMPORTANT: This tool is for informational purposes and not a definitive medical diagnosis.
    const userPrompt = `
You are an expert dermatology assistant. Analyze the provided skin photo and return ONLY a single JSON object (no extra text).
JSON keys:
- diagnosis: short label (e.g. "acne", "eczema", "hyperpigmentation", "normal", "other")
- differential: array of possible alternate diagnoses (strings)
- confidence: number 0-100
- severity: "low"|"medium"|"high"
- treatment_recommendations: array of short recommendation strings (non-prescriptive; include topical suggestions, lifestyle tips)
- refer_to_dermatologist: boolean
- notes: any short caveats (e.g. "image poor quality")
- disclaimer: short text: "Not a medical diagnosis; consult a dermatologist."

Provide numeric or short textual values only. No markdown, no extra commentary, strictly JSON.
`;

    const contents = [
      { inlineData: { mimeType, data: base64 } },
      { text: userPrompt },
    ];

    try {
      const response = await generateWithRetry({ model: "gemini-2.5-flash", contents });
      const rawText = response?.text ?? JSON.stringify(response);

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        parsed = { rawText };
      }

      return res.json({ success: true, result: parsed });
    } catch (err) {
      console.error('Analyze final error:', err?.message || err);
      // Fallback structured mock response
      const fallback = {
        diagnosis: 'other',
        differential: ['acne', 'contact_dermatitis'],
        confidence: 45,
        severity: 'low',
        treatment_recommendations: ['Keep area clean', 'Use gentle cleanser', 'Apply non-comedogenic moisturizer', 'Avoid irritants'],
        refer_to_dermatologist: false,
        notes: 'Model unavailable; returning conservative suggestions.',
        disclaimer: 'Not a medical diagnosis; consult a dermatologist.'
      };
      return res.status(503).json({ success: false, error: 'model unavailable', result: fallback });
    }
  } catch (err) {
    console.error("Analyze error:", err);
    return res.status(500).json({ error: err.message || "server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
