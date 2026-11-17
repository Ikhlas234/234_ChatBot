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
const chatBox = document.getElementById("chat-box");
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const sendLabel = sendBtn.querySelector(".send-label");
const clearBtn = document.getElementById("clear-btn");
const suggestions = document.getElementById("suggestions");

// ---------- State ----------
let history = []; // riwayat percakapan (tanpa system prompt)
let isLoading = false;
let controller = null; // untuk menghentikan respons
let session = 0; // naik setiap percakapan direset

// ---------- Ikon ----------
const BOT_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 8V4H8" /><rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M2 14h2M20 14h2M9 13v2M15 13v2" />
  </svg>`;

// ==========================================================
// Markdown sederhana (aman dari XSS: HTML di-escape dulu)
// ==========================================================
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdown(text) {
  const codeBlocks = [];
  const inlineCodes = [];

  let src = escapeHtml(text);

  // Blok kode ```lang ... ``` (termasuk yang belum ditutup saat streaming)
  src = src.replace(/```[\w-]*\n?([\s\S]*?)(```|$)/g, (_, code) => {
    codeBlocks.push(`<pre><code>${code.replace(/\n$/, "")}</code></pre>`);
    return `@@CODE${codeBlocks.length - 1}@@`;
  });

  // Kode inline
  src = src.replace(/`([^`\n]+)`/g, (_, code) => {
    inlineCodes.push(`<code>${code}</code>`);
    return `@@INL${inlineCodes.length - 1}@@`;
  });

  const formatInline = (s) =>
    s
      .replace(/\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g, "<em>$1</em>");

  const out = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  const openList = (type) => {
    if (listType !== type) {
      closeList();
      out.push(`<${type}>`);
      listType = type;
    }
  };

  