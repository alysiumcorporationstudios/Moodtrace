/**
 * kypeClient — isolated integration point for the NeuraPrompt / Kype AI backend.
 *
 * Env-style configuration (baked at load time for this static prototype). When
 * porting to a real bundler, replace these with `import.meta.env.*` or platform
 * secrets — never ship a real API key in a static file.
 */
const NEURAPROMPT_API_URL =
  (typeof window !== "undefined" && window.NEURAPROMPT_API_URL) ||
  "https://neura-prompt-ai.vercel.app/api/kype";
const NEURAPROMPT_API_KEY =
  (typeof window !== "undefined" && window.NEURAPROMPT_API_KEY) || "";

/** Local fallback question bank — used whenever the API call fails. */
const FALLBACK_QUESTIONS = [
  "What is one small thing that felt good today, even briefly?",
  "How rested did you feel when you woke up this morning?",
  "What kind of energy have you been carrying today?",
  "Was there a moment today when you noticed your mood shift?",
  "Who or what has been on your mind lately?",
  "How gentle have you been with yourself today?",
  "What would feel supportive to you right now?",
  "Is there anything you're looking forward to, big or small?",
  "How does your body feel at this moment?",
  "What emotions have been closest to the surface today?",
  "Have you had space to breathe today?",
  "What has your inner voice been saying today?",
  "Is there something you want to let go of before tomorrow?",
  "When did you last feel truly present today?",
  "What would you tell a friend feeling the way you feel now?",
];

function pickFallbackQuestion(seed) {
  // Deterministic pick per calendar day so the question is stable across
  // re-renders within the same day.
  const s = String(seed || new Date().toISOString().slice(0, 10));
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return FALLBACK_QUESTIONS[h % FALLBACK_QUESTIONS.length];
}

async function callKype(prompt, context) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(NEURAPROMPT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NEURAPROMPT_API_KEY}`,
      },
      body: JSON.stringify({ prompt, context }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Kype HTTP ${res.status}`);

    const contentType = res.headers.get("content-type") || "";

    // SSE streaming branch
    if (contentType.includes("text/event-stream") && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Parse minimal SSE — accumulate any `data:` lines
        chunk.split("\n").forEach((line) => {
          const m = line.match(/^data:\s?(.*)$/);
          if (m && m[1] && m[1] !== "[DONE]") {
            try {
              const parsed = JSON.parse(m[1]);
              text += parsed.text || parsed.content || parsed.delta || "";
            } catch {
              text += m[1];
            }
          }
        });
      }
      return text.trim();
    }

    // Plain JSON branch
    const data = await res.json();
    return (data.text || data.content || data.message || "").trim();
  } finally {
    clearTimeout(timeout);
  }
}

/** Public API. Both methods always resolve — never throw — to keep the UI safe. */
window.kypeClient = {
  async getDailyQuestion(dateISO) {
    try {
      const text = await callKype(
        "Generate one short, warm, non-clinical daily emotional check-in question.",
        { date: dateISO, kind: "daily_question" }
      );
      if (text && text.length > 4) return { text, source: "kype" };
      throw new Error("empty response");
    } catch (e) {
      return { text: pickFallbackQuestion(dateISO), source: "fallback" };
    }
  },

  async getInsight(recentEntries) {
    try {
      const text = await callKype(
        "Given the user's recent mood/anxiety/self-awareness scores, write 1-2 warm, supportive, non-diagnostic sentences reflecting the trend.",
        { kind: "daily_insight", entries: recentEntries }
      );
      if (text) return { text, source: "kype" };
      throw new Error("empty response");
    } catch (e) {
      // Local fallback: derive a gentle reflection
      if (!recentEntries || recentEntries.length === 0) {
        return {
          text: "Welcome. Checking in with yourself is a kind first step.",
          source: "fallback",
        };
      }
      const last = recentEntries[recentEntries.length - 1];
      const avgMood =
        recentEntries.reduce((s, e) => s + (e.mood || 0), 0) /
        recentEntries.length;
      let msg;
      if (last.mood >= 4) msg = "You've been carrying some brightness lately — nice to see.";
      else if (last.mood <= 2) msg = "It sounds like today's been a heavier one. Be gentle with yourself.";
      else if (avgMood >= 3.5) msg = "Your recent days have felt fairly steady.";
      else msg = "There's been some ups and downs — that's part of being human.";
      return { text: msg, source: "fallback" };
    }
  },
};
