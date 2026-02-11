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

  Object.assign(bubbleEl.style, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    zIndex: 2147483647,
    maxWidth: "360px",
    padding: "10px 12px",
    fontSize: "14px",
    lineHeight: "1.35",
    borderRadius: "12px",
    border: "1px solid #ddd",
    background: "white",
    boxShadow: "0 2px 14px rgba(0,0,0,0.18)",
    direction: "rtl",
    whiteSpace: "pre-wrap",
    pointerEvents: "auto"
  });

  document.body.appendChild(bubbleEl);
}

function getSelectedText() {
  const sel = window.getSelection();
  const text = sel?.toString()?.trim() || "";
  if (!text) return "";

  // single word only (remove if you want phrases)
  if (text.split(/\s+/).length !== 1) return "";

  // strip punctuation around selection
  return text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function placeNearSelection() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  const x = Math.round(rect.left + window.scrollX);
  const y = Math.round(rect.bottom + window.scrollY);

  return { x, y };
}

function createButton(x, y, selectedText) {
  cleanup();

  buttonEl = document.createElement("button");
  buttonEl.type = "button";
  buttonEl.textContent = "Translate to Hebrew";

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
    cursor: "pointer",
    boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
    userSelect: "none",
    pointerEvents: "auto"
  });

  buttonEl.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      e.stopPropagation();

      showBubble(x, y + 34, "Translating...");

      chrome.runtime.sendMessage(
        { type: "TRANSLATE_HE", text: selectedText },
        (resp) => {
          if (chrome.runtime.lastError) {
            showBubble(x, y + 34, `Extension error: ${chrome.runtime.lastError.message}`);
            return;
          }

          if (!resp?.ok) {
            showBubble(x, y + 34, `Error: ${resp?.error || "unknown"}`);
            return;
          }

          showBubble(x, y + 34, resp.translated);
        }
      );
    },
    true
  );

  document.body.appendChild(buttonEl);
}

document.addEventListener(
  "mouseup",
  () => {
    const text = getSelectedText();
    if (!text) {
      cleanup();
      return;
    }

    const pos = placeNearSelection();
    if (!pos) return;

    createButton(pos.x, pos.y, text);
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