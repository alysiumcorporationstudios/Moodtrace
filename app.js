/**
 * MoodTrace app — single-file React (in-browser Babel) for static prototype.
 * Data lives in in-memory React state (no localStorage) — swap for Supabase later.
 * Data model: entries keyed by ISO calendar date `YYYY-MM-DD` in user's local tz.
 */
const { useState, useEffect, useMemo, useRef } = React;

/* ---------- date utils (local calendar day) ---------- */
function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayISO() { return toLocalISODate(new Date()); }
function daysAgoISO(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return toLocalISODate(d);
}
function prettyDate(iso) {
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const MOOD_EMOJIS = ["😞","😕","😐","🙂","😊"];

/* ---------- Root App ---------- */
function App() {
  // entries: { [iso]: { date, mood, anxiety, depression, note, question } }
  const [entries, setEntries] = useState({});
  const [tab, setTab] = useState("home");
  const [reminderTime, setReminderTime] = useState("20:00");
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  // Seed a couple of demo entries so charts/history aren't empty on first open.
  useEffect(() => {
    const seed = {};
    const rand = (min,max) => Math.round(min + Math.random()*(max-min));
    for (let i = 5; i >= 1; i--) {
      const iso = daysAgoISO(i);
      seed[iso] = {
        date: iso,
        mood: rand(2,4),
        anxiety: rand(2,6),
        depression: rand(1,5),
        note: "",
        question: "How are you feeling today?",
      };
    }
    setEntries(seed);
  }, []);

  const today = todayISO();
  const yesterday = daysAgoISO(1);
  const todayEntry = entries[today];
  const yesterdayEntry = entries[yesterday];

  // Missed yesterday? => had entries before, none for yesterday, and yesterday isn't first day
  const hasAnyBeforeYesterday = Object.keys(entries).some(d => d < yesterday);
  const missedYesterday = !yesterdayEntry && hasAnyBeforeYesterday;

  function saveEntry(e) {
    setEntries(prev => ({ ...prev, [e.date]: e }));
  }

  function requestNotif() {
    if (typeof Notification === "undefined") { alert("Notifications not supported in this browser."); return; }
    Notification.requestPermission().then(p => setNotifPermission(p));
  }

  // NOTE: browser scheduling here is only a simulated reminder for the prototype.
  // When ported to Android/native, use platform push (e.g. FCM + WorkManager),
  // not this timer.
  useEffect(() => {
    if (notifPermission !== "granted") return;
    const t = setInterval(() => {
      const now = new Date();
      const [h,m] = reminderTime.split(":").map(Number);
      if (now.getHours() === h && now.getMinutes() === m && !entries[todayISO()]) {
        try { new Notification("MoodTrace", { body: "Time for your check-in 💛" }); } catch {}
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [notifPermission, reminderTime, entries]);

  return (
    <>
      <header className="app-header">
        <div>
          <h1>MoodTrace</h1>
          <div className="subtle">{prettyDate(today)}</div>
        </div>
      </header>

      {tab === "home" && (
        <HomeTab
          today={today} yesterday={yesterday}
          todayEntry={todayEntry} yesterdayEntry={yesterdayEntry}
          entries={entries}
          missedYesterday={missedYesterday}
          onSave={saveEntry}
        />
      )}
      {tab === "history" && <HistoryTab entries={entries} />}
      {tab === "insights" && <InsightsTab entries={entries} />}
      {tab === "settings" && (
        <SettingsTab
          reminderTime={reminderTime} setReminderTime={setReminderTime}
          notifPermission={notifPermission} onRequestNotif={requestNotif}
          entries={entries}
        />
      )}

      <nav className="tabbar">
        <div className="tabbar-inner">
          {[
            ["home","Home","🏠"],
            ["history","History","📖"],
            ["insights","Insights","📈"],
            ["settings","Settings","⚙️"],
          ].map(([id,label,icon]) => (
            <button key={id} className={"tab " + (tab===id?"active":"")} onClick={()=>setTab(id)}>
              <span className="tab-icon">{icon}</span>{label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

/* ---------- Home ---------- */
function HomeTab({ today, todayEntry, yesterdayEntry, entries, missedYesterday, onSave }) {
  const [editing, setEditing] = useState(false);
  const showCheckIn = !todayEntry || editing;

  // Elevated-streak detection (3+ days with anxiety OR depression >= 7)
  const supportiveBanner = useMemo(() => {
    const days = [];
    for (let i = 0; i < 3; i++) days.push(daysAgoISO(i));
    const all = days.every(d => {
      const e = entries[d];
      return e && (e.anxiety >= 7 || e.depression >= 7);
    });
    return all;
  }, [entries]);

  return (
    <>
      {supportiveBanner && (
        <div className="banner supportive">
          You've been carrying some heavier feelings for a few days. It might help to talk with someone you trust —
          a friend, family member, or a mental-health professional. This is a moment of care, not a diagnosis.
          {" "}<a href="https://findahelpline.com/" target="_blank" rel="noreferrer">Find support →</a>
        </div>
      )}
      {missedYesterday && !supportiveBanner && (
        <div className="banner">No check-in yesterday — that's okay. Today is a fresh page. 🌱</div>
      )}

      {showCheckIn ? (
        <CheckInCard today={today} existing={todayEntry} onSave={(e)=>{ onSave(e); setEditing(false); }} onCancel={()=>setEditing(false)} />
      ) : (
        <TodaySummaryCard entry={todayEntry} onEdit={()=>setEditing(true)} />
      )}

      <ComparisonCard today={todayEntry} yesterday={yesterdayEntry} />
      <InsightCard entries={entries} />
    </>
  );
}

function CheckInCard({ today, existing, onSave, onCancel }) {
  const [question, setQuestion] = useState(existing?.question || "");
  const [loadingQ, setLoadingQ] = useState(!existing);
  const [mood, setMood] = useState(existing?.mood ?? 3);
  const [anxiety, setAnxiety] = useState(existing?.anxiety ?? 3);
  const [depression, setDepression] = useState(existing?.depression ?? 3);
  const [note, setNote] = useState(existing?.note ?? "");

  useEffect(() => {
    if (existing) return;
    let cancelled = false;
    window.kypeClient.getDailyQuestion(today).then(r => {
      if (!cancelled) { setQuestion(r.text); setLoadingQ(false); }
    });
    return () => { cancelled = true; };
  }, [today, existing]);

  return (
    <div className="card">
      <h2>Today's check-in</h2>
      <div className="question">
        {loadingQ ? <><span className="spinner"/> Loading today's question…</> : question}
      </div>

      <div className="slider-group">
        <div className="slider-label"><span>Overall mood</span></div>
        <div className="mood-row">
          {MOOD_EMOJIS.map((emo,i) => (
            <button key={i} className={"mood-btn " + (mood===i+1?"selected":"")} onClick={()=>setMood(i+1)} aria-label={`Mood ${i+1}`}>{emo}</button>
          ))}
        </div>
      </div>

      <div className="slider-group">
        <div className="slider-label"><span>Anxiety level</span><span className="val">{anxiety}</span></div>
        <input type="range" min="0" max="10" value={anxiety} onChange={e=>setAnxiety(+e.target.value)} />
        <div className="slider-hint">0 = very calm · 10 = very anxious</div>
      </div>

      <div className="slider-group">
        <div className="slider-label"><span>Low mood / energy / interest</span><span className="val">{depression}</span></div>
        <input type="range" min="0" max="10" value={depression} onChange={e=>setDepression(+e.target.value)} />
        <div className="slider-hint">A self-awareness score — not a diagnosis.</div>
      </div>

      <div className="slider-group">
        <div className="slider-label"><span>A short note (optional)</span><span className="val">{note.length}/280</span></div>
        <textarea maxLength={280} value={note} onChange={e=>setNote(e.target.value.slice(0,280))} placeholder="Anything you want to remember about today…" />
      </div>

      <button className="btn" onClick={()=>onSave({ date: today, mood, anxiety, depression, note, question })}>
        {existing ? "Update today's entry" : "Save today's check-in"}
      </button>
      {existing && <button className="btn secondary" onClick={onCancel}>Cancel</button>}
    </div>
  );
}

function TodaySummaryCard({ entry, onEdit }) {
  return (
    <div className="card">
      <h2>You've checked in today ✓</h2>
      <p className="question">{entry.question}</p>
      <div className="summary-scores">
        <div><div className="k">Mood</div><div className="v">{MOOD_EMOJIS[entry.mood-1]}</div></div>
        <div><div className="k">Anxiety</div><div className="v">{entry.anxiety}<span className="muted">/10</span></div></div>
        <div><div className="k">Low-mood</div><div className="v">{entry.depression}<span className="muted">/10</span></div></div>
      </div>
      {entry.note && <p style={{marginTop:12}}>"{entry.note}"</p>}
      <button className="btn ghost" onClick={onEdit}>Edit today's entry</button>
      <div className="muted center" style={{marginTop:4}}>You can edit until midnight.</div>
    </div>
  );
}

/* ---------- Comparison ---------- */
function deltaInfo(todayVal, yestVal, invert=false) {
  if (todayVal == null || yestVal == null) return { dir: "same", arrow: "–", diff: 0 };
  const diff = todayVal - yestVal;
  if (diff === 0) return { dir: "same", arrow: "→", diff: 0 };
  // "invert" = true for anxiety/depression, where lower = better
  const isPositive = invert ? diff < 0 : diff > 0;
  return { dir: isPositive ? "up" : "down", arrow: diff > 0 ? "↑" : "↓", diff };
}

function ComparisonCard({ today, yesterday }) {
  if (!today || !yesterday) {
    return (
      <div className="card">
        <h2>Today vs Yesterday</h2>
        <p>{!today ? "Check in today to see how it compares." : "No entry yesterday to compare against."}</p>
      </div>
    );
  }
  const mood = deltaInfo(today.mood, yesterday.mood, false);
  const anx  = deltaInfo(today.anxiety, yesterday.anxiety, true);
  const dep  = deltaInfo(today.depression, yesterday.depression, true);

  const phrases = [];
  if (mood.diff !== 0)  phrases.push(mood.diff > 0 ? "your mood is a bit brighter than yesterday" : "your mood feels a little heavier than yesterday");
  if (anx.diff !== 0)   phrases.push(anx.diff < 0 ? "your anxiety is a bit lower than yesterday" : "your anxiety is a bit higher than yesterday");
  if (dep.diff !== 0)   phrases.push(dep.diff < 0 ? "your energy/interest feels a bit better than yesterday" : "you're feeling a little lower than yesterday");
  const summary = phrases.length ? "Today, " + phrases.join("; ") + "." : "Today feels much like yesterday — steady ground.";

  return (
    <div className="card">
      <h2>Today vs Yesterday</h2>
      <div className="deltas">
        <div className={"delta " + mood.dir}><div className="label">Mood</div><div className="value">{mood.arrow}</div></div>
        <div className={"delta " + anx.dir}><div className="label">Anxiety</div><div className="value">{anx.arrow}</div></div>
        <div className={"delta " + dep.dir}><div className="label">Low-mood</div><div className="value">{dep.arrow}</div></div>
      </div>
      <div className="delta-text">{summary}</div>
    </div>
  );
}

/* ---------- Insight (Kype) ---------- */
function InsightCard({ entries }) {
  const [insight, setInsight] = useState({ text: "", source: "" });
  const [loading, setLoading] = useState(true);
  const recent = useMemo(() =>
    Object.values(entries).sort((a,b)=>a.date.localeCompare(b.date)).slice(-7),
    [entries]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.kypeClient.getInsight(recent).then(r => {
      if (!cancelled) { setInsight(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [recent.length]);

  return (
    <div className="card">
      <h2>A gentle note</h2>
      {loading ? <p><span className="spinner"/> Reflecting…</p> : <p style={{color:"var(--ink)"}}>{insight.text}</p>}
    </div>
  );
}

/* ---------- History ---------- */
function HistoryTab({ entries }) {
  const [expanded, setExpanded] = useState(null);
  const sorted = Object.values(entries).sort((a,b)=>b.date.localeCompare(a.date));
  if (sorted.length === 0) return <div className="card"><p>No entries yet. Your check-ins will appear here.</p></div>;

  return (
    <>
      {sorted.map(e => (
        <div key={e.date} className="history-item" onClick={()=>setExpanded(expanded===e.date?null:e.date)}>
          <div className="history-row">
            <div className="history-emoji">{MOOD_EMOJIS[e.mood-1]}</div>
            <div style={{flex:1}}>
              <div className="history-date">{prettyDate(e.date)}</div>
              <div className="history-scores">Anxiety {e.anxiety}/10 · Low-mood {e.depression}/10</div>
            </div>
            <div className="muted">{expanded===e.date?"▲":"▼"}</div>
          </div>
          {expanded === e.date && (
            <div className="history-detail">
              <div className="q">"{e.question || "—"}"</div>
              <div>{e.note ? e.note : <span className="muted">No note that day.</span>}</div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/* ---------- Insights (charts) ---------- */
function InsightsTab({ entries }) {
  const [range, setRange] = useState(7);

  const series = useMemo(() => {
    const days = [];
    for (let i = range - 1; i >= 0; i--) days.push(daysAgoISO(i));
    return days.map(d => ({ date: d, e: entries[d] }));
  }, [entries, range]);

  return (
    <>
      <div className="chart-range">
        {[7,30].map(r => (
          <button key={r} className={range===r?"active":""} onClick={()=>setRange(r)}>Last {r} days</button>
        ))}
      </div>
      <ChartCard title="Mood (1–5)"      series={series} accessor={e=>e?e.mood:null}       max={5} color="#b8956a" />
      <ChartCard title="Anxiety (0–10)"  series={series} accessor={e=>e?e.anxiety:null}    max={10} color="#c9bcd6" />
      <ChartCard title="Low-mood (0–10)" series={series} accessor={e=>e?e.depression:null} max={10} color="#a8b89a" />
    </>
  );
}

function ChartCard({ title, series, accessor, max, color }) {
  const w = 440, h = 90, pad = 6;
  const values = series.map(s => accessor(s.e));
  const points = values.map((v,i) => {
    if (v == null) return null;
    const x = pad + (i * (w - pad*2)) / Math.max(1, values.length - 1);
    const y = h - pad - ((v / max) * (h - pad*2));
    return [x,y];
  });
  const path = points.reduce((acc,p,i)=>{
    if (!p) return acc;
    const cmd = acc === "" ? "M" : "L";
    return acc + `${cmd}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
  }, "");

  return (
    <div className="card">
      <div className="chart-title">{title}</div>
      <div className="chart-wrap">
        <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <line x1={pad} x2={w-pad} y1={h-pad} y2={h-pad} stroke="#ece4d8" strokeWidth="1"/>
          {path && <path d={path.trim()} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
          {points.map((p,i)=> p && <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={color}/>)}
        </svg>
      </div>
    </div>
  );
}

/* ---------- Settings ---------- */
function SettingsTab({ reminderTime, setReminderTime, notifPermission, onRequestNotif, entries }) {
  function exportJSON() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `moodtrace-export-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="card">
      <h2>Settings</h2>
      <div className="setting-row">
        <label>Daily reminder time</label>
        <input type="time" value={reminderTime} onChange={e=>setReminderTime(e.target.value)} />
      </div>
      <div className="setting-row">
        <label>Notifications</label>
        {notifPermission === "granted"
          ? <span className="muted">Enabled ✓</span>
          : <button className="btn ghost" style={{width:"auto",margin:0,padding:"6px 12px"}} onClick={onRequestNotif}>Enable</button>}
      </div>
      <div className="setting-row">
        <label>Export data (JSON)</label>
        <button className="btn ghost" style={{width:"auto",margin:0,padding:"6px 12px"}} onClick={exportJSON}>Export</button>
      </div>
      <p className="muted" style={{marginTop:12}}>
        This prototype uses in-memory state. Real push notifications and cloud
        sync will be added when the app is ported (Android push, Supabase).
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);
