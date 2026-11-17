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

  for (const line of src.split("\n")) {
    let m;

    if (/^@@CODE\d+@@$/.test(line.trim())) {
      closeList();
      out.push(line.trim());
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      openList("ul");
      out.push(`<li>${formatInline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      openList("ol");
      out.push(`<li>${formatInline(m[1])}</li>`);
    } else if ((m = line.match(/^#{1,6}\s+(.*)$/))) {
      closeList();
      out.push(`<h4>${formatInline(m[1])}</h4>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${formatInline(line)}</p>`);
    }
  }
  closeList();

  return out
    .join("")
    .replace(/@@CODE(\d+)@@/g, (_, i) => codeBlocks[Number(i)])
    .replace(/@@INL(\d+)@@/g, (_, i) => inlineCodes[Number(i)]);
}

// ==========================================================
// Membuat elemen pesan
// ==========================================================
function timeNow() {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scrollToBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}

function addMessage(role, text = "", { typing = false } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerHTML = role === "bot" ? BOT_ICON : "Anda";
  if (role === "user") avatar.textContent = "A";

  const body = document.createElement("div");
  body.className = "msg-body";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<span>${timeNow()}</span>`;

  body.append(bubble, meta);
  wrapper.append(avatar, body);
  chatBox.appendChild(wrapper);

  if (role === "user") {
    bubble.textContent = text;
  } else if (typing) {
    bubble.innerHTML =
      '<div class="typing" aria-label="Sedang mengetik"><span></span><span></span><span></span></div>';
  } else {
    bubble.innerHTML = renderMarkdown(text);
  }

  scrollToBottom();

  return {
    el: wrapper,

    setContent(content) {
      bubble.innerHTML = renderMarkdown(content);
      scrollToBottom();
    },

    setError(message) {
      wrapper.classList.add("error");
      bubble.textContent = message;
      scrollToBottom();
    },

    finish(fullText) {
      // Tombol salin hanya untuk balasan bot
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "copy-btn";
      copy.textContent = "Salin";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(fullText);
          copy.textContent = "Tersalin ✓";
        } catch {
          copy.textContent = "Gagal menyalin";
        }
        setTimeout(() => (copy.textContent = "Salin"), 1800);
      });
      meta.appendChild(copy);
    },
  };
}

// ==========================================================
// Helper UI
// ==========================================================
function setLoading(state) {
  isLoading = state;
  sendBtn.classList.toggle("stop", state);
  sendLabel.textContent = state ? "Stop" : "Kirim";
  input.disabled = state;

  if (!state) input.focus();
}

function autoResize() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
}

function showWelcome() {
  addMessage("bot", WELCOME_TEXT).finish(WELCOME_TEXT);
}

// Mengambil pesan error yang ramah dari respons server
