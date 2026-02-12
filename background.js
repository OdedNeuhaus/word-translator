function buildUrl(text, sl = "auto") {
  const q = encodeURIComponent(text);
  return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=he&dt=t&q=${q}`;
}

function extractTranslatedText(data) {
  const sentences = data?.[0];
  if (!Array.isArray(sentences)) return null;
  return sentences
    .map(s => (Array.isArray(s) && typeof s[0] === "string" ? s[0] : ""))
    .join("");
}

async function translateToHebrew(text, sl = "auto") {
  const res = await fetch(buildUrl(text, sl), {
    method: "GET",
    headers: { Accept: "application/json,text/plain,*/*" },
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`Google endpoint -> HTTP ${res.status}: ${raw.slice(0, 200)}`);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Google endpoint -> Non-JSON response: ${raw.slice(0, 200)}`);
  }

  const translated = extractTranslatedText(data);
  if (!translated) throw new Error("Google endpoint -> Could not parse translation");
  return translated;
}

// Markers that survive translation very reliably
const MARK_L = "⟦⟦";
const MARK_R = "⟧⟧";

function buildMarkedContext(left, mid, right) {
  // Put markers as separate tokens so they don't "stick" to the word.
  return [left, MARK_L, mid, MARK_R, right]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBetweenMarkers(translatedText) {
  if (typeof translatedText !== "string") return null;

  const i = translatedText.indexOf(MARK_L);
  const j = translatedText.indexOf(MARK_R);
  if (i === -1 || j === -1 || j <= i) return null;

  let inside = translatedText.slice(i + MARK_L.length, j).trim();
  if (!inside) return null;

  inside = inside.replace(/^[\"'“”‘’()\[\]{}<>,.:;!?־\-–—]+|[\"'“”‘’()\[\]{}<>,.:;!?־\-–—]+$/g, "").trim();
  return inside || null;
}



// --- Context menu (works on PDFs too) ---
const MENU_ID = "hebrew_translator_translate_selection";

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID,
        title: "Translate to Hebrew",
        contexts: ["selection"],
      });
    });
  } catch (e) {
    // ignore (some environments may not allow context menus)
    console.warn("Failed to create context menu:", e);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const selected = String(info.selectionText || "").trim();
  if (!selected) return;

  try {
    const translated = await translateToHebrew(selected, "auto");

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Hebrew Translation",
      message: translated,
      priority: 1,
    });
  } catch (e) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Translation failed",
      message: String(e?.message || e),
      priority: 1,
    });
  }
});

// --- End context menu ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      // 1) Single-word, context-aware (2 words left/right) — best disambiguation
      if (msg?.type === "TRANSLATE_HE_CONTEXT5") {
        const word = String(msg.word || "").trim();
        const left = String(msg.left || "").trim();
        const right = String(msg.right || "").trim();

        if (!word) return sendResponse({ ok: false, error: "Empty word" });

        const marked = buildMarkedContext(left, word, right);

        // Force English here for more stable disambiguation on single words.
        const translatedMarked = await translateToHebrew(marked, "en");
        const translatedWord = extractBetweenMarkers(translatedMarked);

        if (translatedWord) return sendResponse({ ok: true, translated: translatedWord });

        // Fallback: translate the marked text with auto-detect (in case the page isn't English)
        const translatedMarkedAuto = await translateToHebrew(marked, "auto");
        const translatedWordAuto = extractBetweenMarkers(translatedMarkedAuto);
        if (translatedWordAuto) return sendResponse({ ok: true, translated: translatedWordAuto });

        // Last resort: word-only
        const translated = await translateToHebrew(word, "en");
        return sendResponse({ ok: true, translated });
      }

      // 2) Multi-word selection / full sentence — translate exactly what user highlighted
      if (msg?.type === "TRANSLATE_HE_SELECTION") {
        const text = String(msg.text || "").trim();
        if (!text) return sendResponse({ ok: false, error: "Empty selection" });

        // For longer text, allow auto-detect (works for English/Italian/etc).
        const translated = await translateToHebrew(text, "auto");
        return sendResponse({ ok: true, translated });
      }

      // Backwards compatible: translate plain text (auto-detect)
      if (msg?.type === "TRANSLATE_HE") {
        const text = String(msg.text || "").trim();
        if (!text) return sendResponse({ ok: false, error: "Empty text" });

        const translated = await translateToHebrew(text, "auto");
        return sendResponse({ ok: true, translated });
      }

      return sendResponse({ ok: false, error: "Unknown message type" });
    } catch (e) {
      return sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true;
});
