let buttonEl = null;
let bubbleEl = null;

function cleanup() {
  if (buttonEl) buttonEl.remove();
  if (bubbleEl) bubbleEl.remove();
  buttonEl = null;
  bubbleEl = null;
}

function showBubble(x, y, text) {
  if (bubbleEl) bubbleEl.remove();

  bubbleEl = document.createElement("div");
  bubbleEl.textContent = text;

  // Reset site CSS influence (ChatGPT and others can make text appear invisible)
  bubbleEl.style.all = "initial";

  Object.assign(bubbleEl.style, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    zIndex: 2147483647,
    maxWidth: "420px",
    padding: "10px 12px",
    fontSize: "14px",
    lineHeight: "1.35",
    borderRadius: "12px",
    border: "1px solid #ddd",
    background: "white",
    color: "#111",
    boxShadow: "0 2px 14px rgba(0,0,0,0.18)",
    direction: "rtl",
    whiteSpace: "pre-wrap",
    pointerEvents: "auto",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  });

  document.body.appendChild(bubbleEl);
}

function normalizeSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

// Remove invisible chars + strip punctuation around word
function normalizeWord(s) {
  if (!s) return "";
  let t = s.trim();
  t = t.replace(/[\u200B-\u200D\uFEFF]/g, "");
  t = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  return t;
}

function isSingleWord(rawSelection) {
  const t = normalizeSpaces(rawSelection);
  if (!t) return false;
  if (t.split(" ").length !== 1) return false;
  const w = normalizeWord(t);
  return /^[\p{L}\p{N}][\p{L}\p{N}'’\-]*$/u.test(w);
}

function closestBlockElement(node) {
  let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (["h1","h2","h3","h4","h5","h6","p","li","blockquote","td","th","article","section"].includes(tag)) {
      return el;
    }
    const cs = window.getComputedStyle(el);
    if (cs && (cs.display === "block" || cs.display === "list-item")) return el;
    el = el.parentElement;
  }
  return document.body;
}

// For single word: take 2 words left + 2 words right (works across spans via ranges)
function buildContext2Left2Right(range, cleanedWord) {
  const block = closestBlockElement(range.commonAncestorContainer);

  const blockRange = document.createRange();
  blockRange.selectNodeContents(block);

  const leftRange = document.createRange();
  leftRange.setStart(blockRange.startContainer, blockRange.startOffset);
  leftRange.setEnd(range.startContainer, range.startOffset);

  const rightRange = document.createRange();
  rightRange.setStart(range.endContainer, range.endOffset);
  rightRange.setEnd(blockRange.endContainer, blockRange.endOffset);

  const leftText = normalizeSpaces(leftRange.toString());
  const rightText = normalizeSpaces(rightRange.toString());

  const leftWords = leftText ? leftText.split(" ").filter(Boolean) : [];
  const rightWords = rightText ? rightText.split(" ").filter(Boolean) : [];

  const left2 = leftWords.slice(Math.max(0, leftWords.length - 2)).join(" ");
  const right2 = rightWords.slice(0, 2).join(" ");

  return { left: left2, right: right2 };
}

function getSelectionInfo() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const raw = sel.toString();

  const trimmed = raw ? raw.trim() : "";
  if (!trimmed) return null;

  // Single word => context-aware
  if (isSingleWord(trimmed)) {
    const word = normalizeWord(trimmed);
    if (!word) return null;

    const ctx = buildContext2Left2Right(range, word);
    return { mode: "word", word, ctx, range };
  }

  // Multi word / sentence => translate selection directly
  // Keep it close to what the user highlighted (only trim ends).
  // Do not normalize punctuation; Google handles it.
  const text = trimmed;
  return { mode: "selection", text, range };
}

function placeNearRange(range) {
  const rect = range.getBoundingClientRect();
  const x = Math.round(rect.left + window.scrollX);
  const y = Math.round(rect.bottom + window.scrollY);
  return { x, y };
}

function createButton(x, y, info) {
  cleanup();

  buttonEl = document.createElement("button");
  buttonEl.type = "button";
  buttonEl.textContent = "Translate to Hebrew";

  // Reset site CSS influence
  buttonEl.style.all = "initial";

  Object.assign(buttonEl.style, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    zIndex: 2147483647,
    padding: "6px 10px",
    fontSize: "12px",
    borderRadius: "10px",
    border: "1px solid #ccc",
    background: "white",
    color: "#111",
    cursor: "pointer",
    boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
    userSelect: "none",
    pointerEvents: "auto",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  });

  function runtimeSendMessageFn() {
    return globalThis?.chrome?.runtime?.sendMessage;
  }

  function safeSendMessage(payload, cb) {
    const sendMessage = runtimeSendMessageFn();
    if (typeof sendMessage !== "function") {
      cb({
        ok: false,
        error:
          "Extension API is not available on this page (sendMessage missing). Try refreshing the page or reloading the extension.",
      });
      return;
    }

    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cb({ ok: false, error: "Timed out talking to background. Reload the page and try again." });
    }, 6000);

    try {
      sendMessage.call(globalThis.chrome.runtime, payload, (resp) => {
        if (done) return;
        done = true;
        clearTimeout(timer);

        const lastErr = globalThis?.chrome?.runtime?.lastError;
        if (lastErr) {
          cb({ ok: false, error: lastErr.message });
          return;
        }

        cb(resp || { ok: false, error: "Empty response from background." });
      });
    } catch (e) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cb({ ok: false, error: String(e?.message || e) });
    }
  }

  buttonEl.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      e.stopPropagation();

      showBubble(x, y + 34, "Translating...");

      let payload;
      if (info.mode === "word") {
        payload = {
          type: "TRANSLATE_HE_CONTEXT5",
          word: info.word,
          left: info.ctx?.left || "",
          right: info.ctx?.right || "",
        };
      } else {
        payload = { type: "TRANSLATE_HE_SELECTION", text: info.text };
      }

      safeSendMessage(payload, (resp) => {
        if (!resp?.ok) {
          showBubble(x, y + 34, `Error: ${resp?.error || "unknown"}`);
          return;
        }
        showBubble(x, y + 34, String(resp.translated || "").trim() || "(no translation)");
      });
    },
    true
  );

  document.body.appendChild(buttonEl);
}

document.addEventListener(
  "mouseup",
  () => {
    const info = getSelectionInfo();
    if (!info) {
      cleanup();
      return;
    }
    const pos = placeNearRange(info.range);
    createButton(pos.x, pos.y, info);
  },
  true
);

document.addEventListener("scroll", cleanup, { passive: true, capture: true });

document.addEventListener(
  "pointerdown",
  (e) => {
    if (e.target === buttonEl || e.target === bubbleEl) return;
    cleanup();
  },
  true
);
