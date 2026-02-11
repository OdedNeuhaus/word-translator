function buildUrl(text) {
  const q = encodeURIComponent(text);
  // client=gtx is the common "free" client param used by many libraries
  return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=he&dt=t&q=${q}`;
}

function extractTranslatedText(data) {
  // Response shape is typically:
  // [
  //   [ [ "שלום", "hello", null, null, ... ], ... ],
  //   null, "en", ...
  // ]
  const sentences = data?.[0];
  if (!Array.isArray(sentences)) return null;

  const parts = [];
  for (const s of sentences) {
    if (Array.isArray(s) && typeof s[0] === "string") parts.push(s[0]);
  }
  return parts.join("");
}

async function translateToHebrew(text) {
  const url = buildUrl(text);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      // Sometimes helps avoid weird responses
      "Accept": "application/json,text/plain,*/*"
    }
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Google endpoint -> HTTP ${res.status}: ${raw.slice(0, 200)}`);
  }

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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "TRANSLATE_HE") return;

  (async () => {
    try {
      const text = String(msg.text || "").trim();
      if (!text) return sendResponse({ ok: false, error: "Empty text" });

      const translated = await translateToHebrew(text);
      sendResponse({ ok: true, translated });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true;
});