// ==========================================================
// Chatbot AI - script.js
// Terhubung ke endpoint POST /api/chat (streaming SSE) di index.js
// ==========================================================

const API_URL = "/api/chat";

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "Kamu adalah asisten AI yang ramah, jelas, dan membantu. Jawab dalam bahasa yang sama dengan pengguna (default Bahasa Indonesia). Gunakan format markdown seperlunya.",
};

const WELCOME_TEXT = "Halo! Ada yang bisa saya bantu?";

// ---------- Elemen DOM ----------
