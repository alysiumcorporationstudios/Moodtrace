# MoodTrace — Static Prototype

A single-page emotional check-in web app. Just open `index.html` in a modern browser (or serve the folder with any static file server).

## What's inside
- `index.html` — page shell + CDN React + Babel (in-browser compile so no build step)
- `styles.css` — warm, calm, non-clinical design system
- `app.js` — React app (Home / History / Insights / Settings)
- `services/kypeClient.js` — isolated NeuraPrompt / Kype integration with SSE + JSON support and local fallback question bank

## Run locally
Just double-click `index.html`. For the AI call to work over `fetch`, serve the folder:

```
npx serve .
# or
python3 -m http.server 8080
```

## Kype / NeuraPrompt config
Configured via globals set on `window` before `services/kypeClient.js` loads. To
test with a real key, add before `<script src="services/kypeClient.js">` in `index.html`:

```html
<script>
  window.NEURAPROMPT_API_URL = "https://neura-prompt-ai.vercel.app/api/kype";
  window.NEURAPROMPT_API_KEY = "np_...";
</script>
```

If the API fails or the key is missing, the app falls back to a local static
question bank — the UI never breaks.

## Scope of this prototype
- ✅ Day-tracking logic (local calendar day, missed-yesterday nudge, edit-until-midnight)
- ✅ Structured check-in (1–5 mood, 0–10 anxiety, 0–10 low-mood, optional 280-char note)
- ✅ Today vs Yesterday comparison with plain-language, non-diagnostic framing
- ✅ Supportive banner on 3+ consecutive elevated days (never diagnostic)
- ✅ History list with expandable detail
- ✅ Insights line charts (7/30 days)
- ✅ Notification permission + reminder-time setting (simulated for web)
- ✅ JSON export
- ✅ Kype call isolated in `services/kypeClient.js` with SSE + JSON + fallback

## Not included (by design)
- No user accounts or auth
- No real database (Supabase comes later; entries are in-memory)
- No real push (native Android push comes later)

## Porting notes
- Swap `useState(entries)` for a Supabase-backed store keyed by `YYYY-MM-DD`.
- Replace the simulated `setInterval` reminder with FCM + WorkManager on Android.
- Keep `services/kypeClient.js` as-is — its public API (`getDailyQuestion`, `getInsight`) is stable.
