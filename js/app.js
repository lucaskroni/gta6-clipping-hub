// GTA 6 Clipping Hub: all app logic. Data lives in Supabase and syncs live between Lucas and Leo.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY, LAUNCH } from "./config.js";
import { ICONS, STEPS } from "./data.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => /^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : "";
const ms = t => (t ? Date.parse(t) || 0 : 0);

// ---------- state ----------
let shared = { done: {}, count: {}, nameA: "Lucas", nameB: "Leo", custom: [], campaigns: [], jobs: [] };
let scoutInfo = null, comments = [], me = null, syncState = "loading";
const VIEW_KEY = "gta6-hub-view";
let view = { step: 0, show: "all" };
try { const v = JSON.parse(localStorage.getItem(VIEW_KEY)); if (v) view = Object.assign(view, v); } catch (e) {}
const saveView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (e) {} };
const openComments = new Set();
let campFilter = "all";

function toast(msg) {
  const el = $("toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2600);
}
async function save(promise) {
  const { error } = await promise;
  if (error) { console.error(error); toast("That change didn't save. Please try again."); await loadAll(); }
}

// ---------- mapping database rows to app objects ----------
const CATS = { gta6: "GTA 6", gaming: "Gaming", other: "Other" };
const CLIPPERS = { OpusClip: "Opus Clip", Everygen: "Everygen" };
const fromCampaign = r => ({ id: r.id, name: r.name, org: r.org, site: r.site, link: r.link, rate: Number(r.rate) || 0, rateUpTo: r.rate_up_to,
  maxPerClip: Number(r.max_per_clip) || 0, budgetUsed: Number(r.budget_used) || 0, budgetTotal: Number(r.budget_total) || 0, budget: r.budget,
  category: CATS[r.category] ? r.category : "other", live: r.live, platforms: r.platforms || {}, note: r.note, foundBy: r.found_by,
  foundAt: ms(r.found_at), checkedAt: ms(r.checked_at), status: r.status, pickA: r.pick_a, pickB: r.pick_b });
const fromJob = r => ({ id: r.id, url: safeUrl(r.url), tool: CLIPPERS[r.tool] ? r.tool : "OpusClip", length: r.length, count: r.count, who: r.who,
  status: r.status, projectId: r.project_id, jobId: r.job_id, shareUrl: safeUrl(r.share_url), title: r.title, error: r.error,
  clips: (Array.isArray(r.clips) ? r.clips : []).slice(0, 10).map(c => ({ title: String(c.title || "Clip"), duration: Number(c.duration) || 0,
    score: Number(c.score) || 0, preview: safeUrl(String(c.preview || "")), hook: String(c.hook || "") })),
  created: ms(r.created), finished: ms(r.finished) });

// ---------- loading + live sync ----------
const loaders = {
  settings: async () => { const { data } = await sb.from("settings").select().eq("id", 1).maybeSingle(); if (data) { shared.nameA = data.name_a; shared.nameB = data.name_b; } },
  progress: async () => { const { data } = await sb.from("progress").select(); const done = {}, count = {};
    (data || []).forEach(r => { if (r.done) done[r.task_id] = true; if (r.count) count[r.task_id] = r.count; }); shared.done = done; shared.count = count; },
  custom_tasks: async () => { const { data } = await sb.from("custom_tasks").select().order("created");
    shared.custom = (data || []).map(r => ({ key: r.id, step: r.step, title: r.title, how: r.how, owner: r.owner, created: ms(r.created) })); },
  campaigns: async () => { const { data } = await sb.from("campaigns").select(); shared.campaigns = (data || []).map(fromCampaign); },
  clip_jobs: async () => { const { data } = await sb.from("clip_jobs").select(); shared.jobs = (data || []).map(fromJob); },
  meta: async () => { const { data } = await sb.from("meta").select().eq("key", "scout").maybeSingle(); scoutInfo = data ? data.value : null; },
  comments: async () => { const { data } = await sb.from("comments").select().order("created"); comments = data || []; },
};
async function loadAll() {
  try { await Promise.all(Object.values(loaders).map(f => f())); syncState = "live"; }
  catch (e) { console.error(e); syncState = "stale"; }
  render();
}
let channel = null;
function subscribe() {
  if (channel) return;
  channel = sb.channel("team-sync");
  Object.keys(loaders).forEach(table => channel.on("postgres_changes", { event: "*", schema: "public", table }, async () => { await loaders[table](); render(); }));
  channel.subscribe(status => {
    if (status === "SUBSCRIBED") { syncState = "live"; renderTeam(); }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { syncState = "stale"; renderTeam(); }
  });
}
// When the tab comes back to the front, refresh in case something was missed while it slept.
document.addEventListener("visibilitychange", () => { if (!document.hidden && me) loadAll(); });

// ---------- roadmap logic (same rules as the original page) ----------
const customFor = i => shared.custom.filter(c => c.step === i).map(c => ({
  id: "c_" + c.key, key: c.key, custom: true, owner: c.owner || "both", title: c.title, how: c.how || "",
  time: "Our task", icon: "flag", theme: "t-teal", pts: 50 }));
const sectionsFor = i => { const extra = customFor(i);
  return extra.length ? STEPS[i].sections.concat([{ title: "Our own tasks", desc: "Tasks you added yourselves.", tasks: extra }]) : STEPS[i].sections; };
const allTasks = i => sectionsFor(i).flatMap(x => x.tasks);
const prog = t => t.target ? Math.min(shared.count[t.id] || 0, t.target) / t.target : (shared.done[t.id] ? 1 : 0);
const isDone = t => prog(t) >= 1;
const stepPct = i => { const ts = allTasks(i); return ts.reduce((a, t) => a + prog(t), 0) / ts.length; };
const stepDone = i => allTasks(i).every(isDone);
const ownerName = o => o === "a" ? shared.nameA : o === "b" ? shared.nameB : "Both";
const visible = t => view.show === "all" || t.owner === "both" || t.owner === view.show;
const findTask = id => { for (let i = 0; i < STEPS.length; i++) for (const t of allTasks(i)) if (t.id === id) return t; };
function points() { let p = 0;
  STEPS.forEach((s, i) => { allTasks(i).forEach(t => { if (isDone(t)) p += t.pts; }); if (stepDone(i)) p += s.bonus; }); return p; }

// ---------- comments ----------
const authorName = email => {
  const team = [shared.nameA, shared.nameB];
  if (me && email === me.email) return "You";
  return email ? (email.split("@")[0]) : team[0];
};
function commentTools(target) {
  const n = comments.filter(c => c.target === target).length;
  return `<button class="linkbtn" type="button" data-ctoggle="${esc(target)}" aria-expanded="${openComments.has(target)}">Comment${n ? ` (${n})` : ""}</button>`;
}
function commentBox(target) {
  if (!openComments.has(target)) return "";
  const list = comments.filter(c => c.target === target);
  const when = t => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `<div class="cm-box">${list.length ? `<ul class="cm-list">${list.map(c => `<li><div class="cm-who"><span>${esc(authorName(c.author_email))} · ${when(c.created)}</span>${me && c.author_email === me.email ? `<button class="linkbtn danger" type="button" data-cmdel="${c.id}">Delete</button>` : ""}</div><div class="cm-body">${esc(c.body)}</div></li>`).join("")}</ul>` : `<p class="cm-empty">No comments yet.</p>`}
    <form class="cm-form" data-target="${esc(target)}"><input type="text" maxlength="1000" required placeholder="Write a comment…" aria-label="Write a comment"><button class="btn primary" type="submit">Post</button></form></div>`;
}

// ---------- rendering ----------
function renderCountdown() {
  const today = new Date(); const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((Date.parse(LAUNCH) - t0) / 864e5);
  const el = $("countdown");
  if (days > 0) el.innerHTML = `<span class="big">${days}</span><span class="small">${days === 1 ? "day" : "days"} until GTA 6 launches</span>`;
  else if (days === 0) el.innerHTML = `<span class="big">Today</span><span class="small">GTA 6 is out. Go!</span>`;
  else el.innerHTML = `<span class="big">Day ${1 - days}</span><span class="small">since GTA 6 launched</span>`;
}
function renderTeam() {
  const a = $("nameA"), b = $("nameB");
  if (document.activeElement !== a) a.value = shared.nameA;
  if (document.activeElement !== b) b.value = shared.nameB;
  document.querySelectorAll(".nA").forEach(e => e.textContent = shared.nameA);
  document.querySelectorAll(".nB").forEach(e => e.textContent = shared.nameB);
  const opts = [["all", "Everyone"], ["a", shared.nameA], ["b", shared.nameB]];
  $("filter").innerHTML = opts.map(([k, l]) => `<button class="chipbtn" type="button" data-show="${k}" aria-pressed="${view.show === k}">${esc(l)}</button>`).join("");
  $("sync").textContent = syncState === "live" ? "Synced live with your team. Changes show up for both of you."
    : syncState === "loading" ? "Connecting to your team's shared progress…" : "Can't reach the shared progress right now. What you see may be out of date.";
  $("who").textContent = me ? `Signed in as ${me.email}` : "";
}
function renderTabs() {
  $("tabs").innerHTML = STEPS.map((s, i) => { const ts = allTasks(i), d = ts.filter(isDone).length;
    return `<button class="tab ${stepDone(i) ? "done" : ""}" role="tab" aria-selected="${i === view.step}" data-i="${i}">
      <span class="num">${stepDone(i) ? "✓" : i + 1}</span>${s.title}<span class="sub">${d}/${ts.length}</span></button>`; }).join("");
}
function renderCard() {
  const i = view.step, s = STEPS[i], ts = allTasks(i), pct = Math.round(stepPct(i) * 100);
  const mine = k => ts.filter(t => t.owner === k).length;
  const el = $("stepcard");
  el.className = "stepcard" + (stepDone(i) ? " complete" : "");
  el.innerHTML = `
    <div class="stephead"><span class="label"><span class="badge-num">${i + 1}</span>${s.name}</span>
      <div class="pct">${pct}% completed<div class="bar"><i style="width:${pct}%"></i></div></div></div>
    <h2>${s.title}</h2><p>${s.desc}</p>
    <ul class="meta">
      <li><span class="ic">${ICONS.calendar}</span>${s.weeks}</li>
      <li><span class="ic">${ICONS.level}</span>${s.level}</li>
      <li><span class="ic">${ICONS.tasks}</span>${ts.length} tasks: ${mine("a")} ${esc(shared.nameA)}, ${mine("b")} ${esc(shared.nameB)}, ${mine("both")} together</li>
      <li><span class="ic">${ICONS.clock}</span>${s.hours}</li>
      <li><span class="ic" style="background:var(--gold-soft);color:var(--gold)">${ICONS.medal}</span>+${s.bonus} points <span class="reward">(${s.badge})</span></li>
    </ul>
    <div class="unlocked">${s.badge} unlocked. Nice teamwork.</div>
    ${i < STEPS.length - 1 ? `<button class="nextbtn" type="button" data-next="1">Continue to Step ${i + 2}</button>` : ""}`;
}
function card(t) {
  const done = isDone(t), pr = prog(t);
  let status, control;
  if (t.target) { const c = Math.min(shared.count[t.id] || 0, t.target);
    status = done ? "Completed" : `${c} of ${t.target}`;
    control = `<span class="counter"><button class="btn" type="button" data-dec="${t.id}" aria-label="Remove one from ${esc(t.title)}">−</button><button class="btn primary" type="button" data-inc="${t.id}" aria-label="Add one to ${esc(t.title)}">+</button></span>`;
  } else { status = done ? "Completed" : "Not started";
    control = `<button class="btn primary" type="button" data-toggle="${t.id}">${done ? "Done ✓" : "Mark done"}</button>`; }
  const title = t.custom ? esc(t.title) : t.title, how = t.custom ? esc(t.how) : t.how;
  const target = "task:" + t.id;
  return `<article class="card ${done ? "done" : ""} ${visible(t) ? "" : "hidden"}">
    <div class="thumb ${t.theme}">${ICONS[t.icon]}<span class="time">${t.time}</span></div>
    <div class="cardrow"><span class="owner o-${t.owner}">${esc(ownerName(t.owner))}</span><span class="cardtools">${commentTools(target)}${t.custom ? `<button class="linkbtn danger" type="button" data-del="${t.key}">Remove</button>` : ""}</span></div>
    <h4>${title}</h4><p class="how">${how}</p>
    <div class="bar ${done ? "good" : ""}"><i style="width:${Math.round(pr * 100)}%"></i></div>
    <div class="status"><span class="s">${status} · +${t.pts}</span>${control}</div>
    ${commentBox(target)}
  </article>`;
}
function renderTimeline() {
  const i = view.step;
  const html = sectionsFor(i).map(sec => {
    const n = sec.tasks.length, d = sec.tasks.filter(isDone).length, full = d === n;
    const p = sec.tasks.reduce((a, t) => a + prog(t), 0) / n;
    const marker = full ? `<div class="marker check">${ICONS.check}</div>` : `<div class="marker ring" style="--p:${Math.round(p * 100)}%" data-l="${d}/${n}"></div>`;
    return `<section class="section ${full ? "complete" : ""}">${marker}<h3>${sec.title}</h3><p>${sec.desc}</p>
      <div class="cards">${sec.tasks.map(card).join("")}</div></section>`;
  }).join("");
  const form = `<section class="section addsec"><div class="marker ring" style="--p:0%" data-l="+"></div>
      <h3>Add your own task</h3><p>Anything else you two want on this step. It's shared with your partner.</p>
      <form class="addform" id="addform">
        <label for="newTitle">Task<input id="newTitle" type="text" maxlength="80" required placeholder="e.g. Make a channel banner"></label>
        <label for="newHow">Details<input id="newHow" type="text" maxlength="200" placeholder="What exactly to do"></label>
        <label for="newOwner">Who<select id="newOwner"><option value="both">Both</option><option value="a">${esc(shared.nameA)}</option><option value="b">${esc(shared.nameB)}</option></select></label>
        <button class="btn primary" type="submit">Add task</button>
      </form></section>`;
  $("timeline").innerHTML = html + form;
}

// ---------- campaigns ----------
const money = n => n >= 1000 ? "$" + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K" : "$" + Math.round(n);
const ago = t => { if (!t) return ""; const h = (Date.now() - t) / 36e5; return h < 1 ? "just now" : h < 24 ? Math.floor(h) + "h ago" : Math.floor(h / 24) + "d ago"; };
function renderCampaigns() {
  const el = $("campaigns");
  const list = shared.campaigns, live = list.filter(c => c.status !== "dropped");
  const n = { all: live.length, gta6: live.filter(c => c.category === "gta6").length, gaming: live.filter(c => c.category === "gaming").length, joined: list.filter(c => c.status === "joined").length };
  const fresh = list.filter(c => c.foundAt && Date.now() - c.foundAt < 48 * 36e5).length;
  const lastRun = scoutInfo && ms(scoutInfo.last_run);
  const addOpen = el.querySelector(".cx-add")?.open;
  el.innerHTML = `
    <div class="camphead">
      <div><h2>Campaigns</h2>
        <p>The scout checks the clipping sites for new GTA 6 and gaming campaigns and adds them here. Tap your name on the ones you like and join the ones you both pick.</p></div>
      <div class="cx-scout"><span class="cx-live"></span><div><b>${lastRun ? "Last checked " + ago(lastRun) : "Not checked yet"}</b>
        <span>${scoutInfo && scoutInfo.summary ? esc(scoutInfo.summary) : "Next check runs automatically."}${fresh ? ` · ${fresh} new in the last 2 days` : ""}</span></div></div>
    </div>
    <div class="cx-filters" role="group" aria-label="Show campaigns">${[["all", "All active"], ["gta6", "GTA 6"], ["gaming", "Gaming"], ["joined", "Joined"]].map(([k, l]) =>
      `<button type="button" class="chipbtn" data-cfilter="${k}" aria-pressed="${campFilter === k}">${l} <span class="cx-n">${n[k]}</span></button>`).join("")}</div>
    <div class="cx-grid" id="cgrid"></div>
    <details class="cx-add"${addOpen ? " open" : ""}><summary>Add a campaign yourself</summary><form class="campform" id="campform">
      <label class="wide" for="cName">Campaign<input id="cName" type="text" maxlength="80" required placeholder="e.g. GTA 6 Clipping Campaign"></label>
      <label class="wide" for="cLink">Link<input id="cLink" type="url" maxlength="300" placeholder="https://contentrewards.com/…"></label>
      <label for="cRate">$ per 1K views<input id="cRate" type="number" min="0" max="100" step="0.05" placeholder="1.00"></label>
      <label for="cCat">Type<select id="cCat"><option value="gta6">GTA 6</option><option value="gaming">Gaming</option><option value="other">Other</option></select></label>
      <label for="cBudget">Budget<input id="cBudget" type="text" maxlength="30" placeholder="$12K of $20K used"></label>
      <fieldset><legend>Platforms allowed</legend>
        <label><input type="checkbox" id="pYT" checked>YT</label><label><input type="checkbox" id="pTT" checked>TT</label><label><input type="checkbox" id="pIG" checked>IG</label></fieldset>
      <label class="wide" for="cNote">Notes<input id="cNote" type="text" maxlength="160" placeholder="Rules, required hashtags, which streamer…"></label>
      <button class="btn primary" type="submit">Add campaign</button>
    </form></details>`;
  renderCampRows();
}
function renderCampRows() {
  const g = $("cgrid"); if (!g) return;
  const catRank = { gta6: 0, gaming: 1, other: 2 }, stRank = { joined: 0, considering: 1, dropped: 2 };
  let list = shared.campaigns.slice();
  if (campFilter === "joined") list = list.filter(c => c.status === "joined");
  else { list = list.filter(c => c.status !== "dropped"); if (campFilter !== "all") list = list.filter(c => c.category === campFilter); }
  list.sort((a, b) => (stRank[a.status] - stRank[b.status]) || (catRank[a.category] - catRank[b.category]) || ((a.live === false) - (b.live === false)) || ((b.rate || 0) - (a.rate || 0)));
  const dropped = shared.campaigns.filter(c => c.status === "dropped").length;
  if (!list.length) { g.innerHTML = `<div class="empty" style="grid-column:1/-1">${campFilter === "joined" ? "You haven't joined a campaign yet." : "No campaigns here yet. The scout adds new ones automatically."}</div>`; return; }
  const initials = n => esc(String(n || "?").trim().slice(0, 1).toUpperCase());
  const PL = { yt: "YouTube", tt: "TikTok", ig: "Reels" };
  g.innerHTML = list.map(c => {
    const url = safeUrl(c.link), isNew = c.foundAt && Date.now() - c.foundAt < 48 * 36e5;
    const left = c.budgetTotal ? Math.max(0, c.budgetTotal - c.budgetUsed) : 0;
    const pctLeft = c.budgetTotal ? Math.round(left / c.budgetTotal * 100) : null;
    const plat = ["yt", "tt", "ig"].filter(k => c.platforms && c.platforms[k]);
    const target = "campaign:" + c.id;
    return `<article class="cx-card ${c.status} cat-${c.category}${c.live === false ? " is-paused" : ""}">
      <header class="cx-head">
        <div class="cx-badges"><span class="cx-cat">${CATS[c.category]}</span>${isNew ? `<span class="cx-new">New</span>` : ""}${c.live === false ? `<span class="cx-paused">Paused</span>` : ""}${c.status === "joined" ? `<span class="cx-joined">Joined</span>` : ""}</div>
        <span class="cx-site">${esc(c.site)}</span>
      </header>
      <div class="cx-titleblock"><h3>${esc(c.name)}</h3>${c.org ? `<div class="cx-org">by ${esc(c.org)}</div>` : ""}</div>
      <div class="cx-rate">
        <div class="cx-rate-main">${c.rateUpTo ? `<span class="cx-upto">up to</span>` : ""}<b>${c.rate ? "$" + c.rate.toFixed(2) : "–"}</b><span class="cx-unit">per 1K views</span></div>
        ${c.maxPerClip ? `<div class="cx-cap"><b>$${c.maxPerClip}</b><span>max per clip</span></div>` : ""}
      </div>
      <div class="cx-fund">
        <div class="cx-fund-row"><span>Budget left</span><b>${c.budgetTotal ? money(left) + `<i> of ${money(c.budgetTotal)}</i>` : esc(c.budget || "Not shown")}</b></div>
        ${pctLeft !== null ? `<div class="cx-meter ${pctLeft < 20 ? "low" : ""}" role="img" aria-label="${pctLeft}% of the budget left"><i style="width:${pctLeft}%"></i></div>` : ""}
      </div>
      <div class="cx-plat">${plat.length ? plat.map(k => `<span class="cx-pchip">${PL[k]}</span>`).join("") : `<span class="cx-muted">Platforms: see the campaign page</span>`}</div>
      ${c.note ? `<p class="cx-note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg><span>${esc(c.note)}</span></p>` : ""}
      <div class="cx-who">
        <span class="cx-who-label">${c.pickA && c.pickB ? "You both like this" : "Who's in?"}</span>
        <span class="cx-avatars">
          <button class="cx-av" type="button" data-pick="${esc(c.id)}|a" aria-pressed="${!!c.pickA}" title="${esc(shared.nameA)}" aria-label="${esc(shared.nameA)} likes this">${initials(shared.nameA)}</button>
          <button class="cx-av b" type="button" data-pick="${esc(c.id)}|b" aria-pressed="${!!c.pickB}" title="${esc(shared.nameB)}" aria-label="${esc(shared.nameB)} likes this">${initials(shared.nameB)}</button>
        </span>
      </div>
      <div class="cx-cta">
        ${url ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Open campaign<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>` : ""}
        ${c.status === "joined"
          ? `<button class="btn success" type="button" data-cset="${esc(c.id)}|considering" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Joined</button>`
          : c.status === "dropped" ? `<button class="btn" type="button" data-cset="${esc(c.id)}|considering">Restore</button>`
          : `<button class="btn primary" type="button" data-cset="${esc(c.id)}|joined">Mark as joined</button>`}
      </div>
      <footer class="cx-foot">
        <span>${c.foundBy === "claude" ? `Found by the scout ${ago(c.foundAt)}` : "Added by you"}${c.checkedAt ? ` · checked ${ago(c.checkedAt)}` : ""}</span>
        <span class="cx-links">${commentTools(target)}${c.status !== "dropped" ? `<button class="linkbtn" type="button" data-cset="${esc(c.id)}|dropped">Drop</button>` : ""}<button class="linkbtn danger" type="button" data-cdel="${esc(c.id)}">Remove</button></span>
      </footer>
      ${commentBox(target)}
    </article>`;
  }).join("") + (dropped && campFilter !== "joined" ? `<div class="cx-muted" style="grid-column:1/-1">${dropped} dropped campaign${dropped > 1 ? "s" : ""} hidden. Use the Joined filter or Restore to bring one back.</div>` : "");
}

// ---------- clip studio ----------
const fmtDate = t => t ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const GRADS = ["linear-gradient(160deg,#ff2d87,#7b2cff)", "linear-gradient(160deg,#ff7a18,#ff2d55)", "linear-gradient(160deg,#00d2ff,#7b2cff)", "linear-gradient(160deg,#20e3b2,#0b7bff)", "linear-gradient(160deg,#ffd000,#ff4d00)", "linear-gradient(160deg,#b14dff,#ff2d87)"];
const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 01-10 0c0-2.5 1.2-4 2.5-5 .2 1.8 1 2.8 2.2 3.2C11 8.5 11 5 12 2z" fill="currentColor"/></svg>';
const TOOL_HOME = { OpusClip: "https://clip.opus.pro/dashboard", Everygen: "https://everygen.ai" };
function renderStudio() {
  const el = $("studio");
  const done = shared.jobs.filter(j => j.status === "done"), clipsMade = done.reduce((a, j) => a + j.clips.length, 0);
  const busy = shared.jobs.filter(j => j.status === "processing" || j.status === "starting").length;
  // keep what's typed in the form across live updates
  const keep = { url: $("sUrl")?.value || "", tool: document.querySelector('input[name="sTool"]:checked')?.value || "OpusClip",
    len: document.querySelector('input[name="sLen"]:checked')?.value || "20", count: $("sCount")?.value || "6", who: document.querySelector('input[name="sWho"]:checked')?.value || "a" };
  el.innerHTML = `
    <div class="sx-hero">
      <div class="sx-kicker"><span class="sx-dot"></span>${busy ? busy + " video" + (busy > 1 ? "s" : "") + " clipping now" : "Ready to clip"}</div>
      <h2 class="sx-title">Turn streams into <span class="sx-grad">viral Shorts</span></h2>
      <p class="sx-sub">Drop a YouTube link, pick your tool, length and clip count. It goes into your shared queue so you both see what's being clipped.</p>
      <div class="sx-stats"><div><b>${shared.jobs.length}</b><span>videos</span></div><div><b>${clipsMade}</b><span>clips made</span></div><div><b>${done.filter(j => j.clips.some(c => c.hook)).length}</b><span>with hooks</span></div></div>
    </div>
    <form class="studioform" id="studioform">
      <div class="sx-drop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <label class="sx-vh" for="sUrl">YouTube link</label><input id="sUrl" type="url" required maxlength="300" placeholder="Paste a YouTube link…" value="${esc(keep.url)}">
        <button class="sx-go" type="submit">Add to queue<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
      <div class="sx-opts">
        <fieldset class="sx-seg"><legend>Tool</legend>${Object.entries(CLIPPERS).map(([k, l]) => `<label><input type="radio" name="sTool" value="${k}" ${keep.tool === k ? "checked" : ""}><span>${l}</span></label>`).join("")}</fieldset>
        <fieldset class="sx-seg"><legend>Length</legend>${[15, 20, 30, 45, 60].map(n => `<label><input type="radio" name="sLen" value="${n}" ${String(n) === keep.len ? "checked" : ""}><span>${n}s</span></label>`).join("")}</fieldset>
        <div class="sx-count"><span class="sx-lg" id="sCountLbl">Clips</span><button type="button" class="sx-step" data-cstep="-1" aria-label="Fewer clips">−</button><input id="sCount" type="number" min="1" max="10" value="${esc(keep.count)}" aria-labelledby="sCountLbl"><button type="button" class="sx-step" data-cstep="1" aria-label="More clips">+</button></div>
        <fieldset class="sx-seg"><legend>Added by</legend><label><input type="radio" name="sWho" value="a" ${keep.who === "a" ? "checked" : ""}><span>${esc(shared.nameA)}</span></label><label><input type="radio" name="sWho" value="b" ${keep.who === "b" ? "checked" : ""}><span>${esc(shared.nameB)}</span></label></fieldset>
      </div>
    </form>
    <p class="sx-note">Automatic clipping and "Write hooks with Claude" come next (they need an Opus Clip API key and a Claude API key stored safely on the server). For now, open the tool and paste the link there. Only clip videos you're allowed to use.</p>
    <div class="jobs" id="jobs"></div>`;
  renderJobs();
}
function renderJobs() {
  const box = $("jobs"); if (!box) return;
  const list = shared.jobs.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
  if (!list.length) { box.innerHTML = `<div class="sx-empty"><b>No videos yet</b>Paste your first YouTube link above.</div>`; return; }
  box.innerHTML = list.map(j => {
    const label = { queued: "Queued", starting: "Starting", processing: "Clipping", done: "Ready", error: "Problem" }[j.status];
    const target = "job:" + j.id;
    let body = "";
    if (j.status === "processing" || j.status === "starting") body = `<div class="sx-bar"><i></i></div><p class="jobmsg">${CLIPPERS[j.tool]} is finding the best moments. Usually 5–15 minutes.</p>`;
    if (j.status === "error") body = `<p class="jobmsg err">${esc(j.error)}</p>`;
    if (j.status === "done") body = j.clips.length ? `<div class="sx-reel">${j.clips.map((c, i) => {
      const inner = `<span class="sx-rank">#${i + 1}</span>${c.duration ? `<span class="sx-dur">0:${String(c.duration).padStart(2, "0")}</span>` : ""}
        ${c.hook ? `<span class="sx-cap">${esc(c.hook)}</span>` : `<span class="sx-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></span>`}
        <span class="sx-foot">${c.score ? `<span class="sx-fire">${FLAME}${c.score}</span>` : ""}<span class="sx-ct">${esc(c.title)}</span></span>`;
      return c.preview ? `<a class="sx-phone" style="background:${GRADS[i % GRADS.length]}" href="${esc(c.preview)}" target="_blank" rel="noopener" aria-label="Preview clip ${i + 1}: ${esc(c.title)}">${inner}</a>`
        : `<div class="sx-phone" style="background:${GRADS[i % GRADS.length]}">${inner}</div>`;
    }).join("")}</div>` : `<p class="jobmsg">The clips are ready in your ${CLIPPERS[j.tool]} account.</p>`;
    const btns = [];
    if (j.status === "queued" || j.status === "error") btns.push(`<a class="sx-btn hot" href="${TOOL_HOME[j.tool]}" target="_blank" rel="noopener">Open ${CLIPPERS[j.tool]}</a>`, `<button class="sx-btn" type="button" data-copy="${esc(j.url)}">Copy link</button>`);
    if (j.shareUrl) btns.push(`<a class="sx-btn" href="${esc(j.shareUrl)}" target="_blank" rel="noopener">Open in ${CLIPPERS[j.tool]}</a>`);
    if (j.url) btns.push(`<a class="sx-btn ghost" href="${esc(j.url)}" target="_blank" rel="noopener">Source video</a>`);
    btns.push(commentTools(target), `<button class="linkbtn" type="button" data-jdel="${esc(j.id)}">Remove</button>`);
    return `<article class="job sx-job">
      <div class="jobtop"><div><div class="jobtitle">${esc(j.title || j.url)}</div>
        <div class="sx-tags"><span>${CLIPPERS[j.tool]}</span>${j.tool === "OpusClip" ? `<span>${j.length}s</span>` : ""}<span>${j.count} clips</span><span>by ${esc(ownerName(j.who))}</span>${j.created ? `<span>${fmtDate(j.created)}</span>` : ""}</div></div>
        <span class="sx-state ${j.status}">${j.status === "processing" || j.status === "starting" ? '<span class="sx-dot"></span>' : ""}${label}</span></div>
      ${body}<div class="jobbtns">${btns.join("")}</div>${commentBox(target)}</article>`;
  }).join("");
}

// ---------- page switching ----------
const PAGES = ["roadmap", "studio", "campaigns", "guide"];
function showPage() {
  const h = (location.hash || "").slice(1), cur = PAGES.includes(h) ? h : "roadmap";
  document.querySelectorAll(".page").forEach(p => { p.hidden = p.dataset.page !== cur; });
  document.querySelectorAll("#pagenav a").forEach(a => { if (a.dataset.page === cur) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}
function renderNavCounts() {
  const all = STEPS.flatMap((s, i) => allTasks(i));
  $("pc-roadmap").textContent = Math.round(all.reduce((a, t) => a + prog(t), 0) / all.length * 100) + "%";
  const busy = shared.jobs.filter(j => j.status === "processing" || j.status === "starting").length;
  $("pc-studio").textContent = busy ? busy + " clipping" : (shared.jobs.length || "");
  $("pc-campaigns").textContent = shared.campaigns.filter(c => c.status !== "dropped").length || "";
}
window.addEventListener("hashchange", () => { showPage(); window.scrollTo({ top: 0 }); });

// Don't redraw while someone is typing in a form; redraw as soon as they leave it.
let pendingRender = false;
const typing = () => { const a = document.activeElement; return a && a.matches("input[type=text], input[type=url], input[type=number], select") && a.closest("#app") && !a.matches("#nameA, #nameB"); };
document.addEventListener("focusout", () => setTimeout(() => { if (pendingRender && !typing()) render(); }, 0));
function render() {
  if (!me) return;
  if (typing()) { pendingRender = true; renderTeam(); renderNavCounts(); return; }
  pendingRender = false;
  renderCountdown(); renderTeam(); renderTabs(); renderCard(); renderTimeline(); renderStudio(); renderCampaigns(); renderNavCounts();
  $("points").textContent = points().toLocaleString("en");
  const all = STEPS.flatMap((s, i) => allTasks(i));
  $("overall").textContent = Math.round(all.reduce((a, t) => a + prog(t), 0) / all.length * 100) + "%";
}

// ---------- actions ----------
const saveProgress = id => save(sb.from("progress").upsert({ task_id: id, done: !!shared.done[id], count: shared.count[id] || 0, updated_at: new Date().toISOString() }));
const updateCampaign = (c, fields) => save(sb.from("campaigns").update(fields).eq("id", c.id));

["nameA", "nameB"].forEach(k => $(k).addEventListener("change", e => {
  const v = e.target.value.trim().slice(0, 16) || (k === "nameA" ? "Clipper 1" : "Clipper 2");
  if (v === shared[k]) return;
  shared[k] = v; render();
  save(sb.from("settings").update(k === "nameA" ? { name_a: v, updated_at: new Date().toISOString() } : { name_b: v, updated_at: new Date().toISOString() }).eq("id", 1));
}));

document.addEventListener("submit", async e => {
  const f = e.target;
  if (f.id === "loginform") return; // handled below
  e.preventDefault();
  if (f.classList.contains("cm-form")) {
    const input = f.querySelector("input"), body = input.value.trim(); if (!body) return;
    input.value = ""; input.blur();
    await save(sb.from("comments").insert({ target: f.dataset.target, body }));
    await loaders.comments(); render(); return;
  }
  if (f.id === "addform") {
    const title = $("newTitle").value.trim(); if (!title) return;
    const row = { step: view.step, title, how: $("newHow").value.trim(), owner: $("newOwner").value };
    $("newTitle").value = ""; $("newHow").value = ""; document.activeElement?.blur();
    await save(sb.from("custom_tasks").insert(row)); await loaders.custom_tasks(); render(); toast("Task added"); return;
  }
  if (f.id === "campform") {
    const name = $("cName").value.trim(); if (!name) return;
    const row = { name, link: safeUrl($("cLink").value.trim()), rate: Math.min(100, Math.max(0, Number($("cRate").value) || 0)), budget: $("cBudget").value.trim(),
      category: $("cCat").value, found_by: "team", found_at: new Date().toISOString(), note: $("cNote").value.trim(),
      platforms: { yt: $("pYT").checked, tt: $("pTT").checked, ig: $("pIG").checked } };
    document.activeElement?.blur(); f.reset();
    await save(sb.from("campaigns").insert(row)); await loaders.campaigns(); render(); toast("Campaign added"); return;
  }
  if (f.id === "studioform") {
    const url = safeUrl($("sUrl").value.trim());
    if (!/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(url)) { toast("Please paste a YouTube link that starts with https://"); return; }
    const row = { url, tool: document.querySelector('input[name="sTool"]:checked')?.value || "OpusClip",
      length: Number(document.querySelector('input[name="sLen"]:checked')?.value) || 20,
      count: Math.max(1, Math.min(10, Number($("sCount").value) || 6)), who: document.querySelector('input[name="sWho"]:checked')?.value || "a", owner_id: me.id };
    $("sUrl").value = ""; document.activeElement?.blur();
    await save(sb.from("clip_jobs").insert(row)); await loaders.clip_jobs(); render(); toast("Added to the queue");
  }
});

function confirmClick(b, label) {
  if (b.dataset.armed) return true;
  b.dataset.armed = "1"; b.textContent = "Sure?";
  setTimeout(() => { b.textContent = label; delete b.dataset.armed; }, 3000);
  return false;
}

document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b || !me) return;
  const i = view.step, wasDone = stepDone(i);
  const d = b.dataset;
  if (d.show) { view.show = d.show; saveView(); render(); return; }
  if (d.i !== undefined) { view.step = +d.i; saveView(); render(); return; }
  if (d.next) { view.step = Math.min(i + 1, STEPS.length - 1); saveView(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (d.ctoggle) { openComments.has(d.ctoggle) ? openComments.delete(d.ctoggle) : openComments.add(d.ctoggle); render(); return; }
  if (d.cmdel) { if (!confirmClick(b, "Delete")) return; await save(sb.from("comments").delete().eq("id", d.cmdel)); await loaders.comments(); render(); return; }
  if (d.cfilter) { campFilter = d.cfilter; renderCampaigns(); return; }
  if (d.cstep) { const inp = $("sCount"); inp.value = Math.max(1, Math.min(10, (Number(inp.value) || 6) + Number(d.cstep))); return; }
  if (d.copy) { try { await navigator.clipboard.writeText(d.copy); toast("Link copied"); } catch (err) { toast("Couldn't copy. Select the link and copy it yourself."); } return; }
  if (d.jdel) { if (!confirmClick(b, "Remove")) return; shared.jobs = shared.jobs.filter(x => x.id !== d.jdel); render(); save(sb.from("clip_jobs").delete().eq("id", d.jdel)); return; }
  if (d.cset) {
    const [id, st] = d.cset.split("|"); const c = shared.campaigns.find(x => x.id === id); if (!c) return;
    c.status = st; render(); updateCampaign(c, { status: st });
    if (st === "joined") toast(`Joined ${c.name}. Read its rules before your first clip.`);
    if (st === "dropped") toast("Campaign dropped");
    return;
  }
  if (d.pick) {
    const [id, who] = d.pick.split("|"); const c = shared.campaigns.find(x => x.id === id); if (!c) return;
    if (who === "a") c.pickA = !c.pickA; else c.pickB = !c.pickB;
    render(); updateCampaign(c, who === "a" ? { pick_a: c.pickA } : { pick_b: c.pickB });
    if (c.pickA && c.pickB) toast("You both like this one. Time to join it?");
    return;
  }
  if (d.cdel) { if (!confirmClick(b, "Remove")) return; shared.campaigns = shared.campaigns.filter(x => x.id !== d.cdel); render(); save(sb.from("campaigns").delete().eq("id", d.cdel)); return; }
  if (d.del) {
    if (!confirmClick(b, "Remove")) return;
    shared.custom = shared.custom.filter(c => c.key !== d.del); delete shared.done["c_" + d.del]; render();
    save(sb.from("custom_tasks").delete().eq("id", d.del)); save(sb.from("progress").delete().eq("task_id", "c_" + d.del)); return;
  }
  if (d.toggle) { const t = findTask(d.toggle); shared.done[t.id] = !shared.done[t.id]; saveProgress(t.id); if (shared.done[t.id]) toast(`+${t.pts} points`); }
  if (d.inc) { const t = findTask(d.inc); const c = shared.count[t.id] || 0; if (c < t.target) { shared.count[t.id] = c + 1; saveProgress(t.id); if (c + 1 === t.target) toast(`${t.title}: done! +${t.pts} points`); } }
  if (d.dec) { const t = findTask(d.dec); shared.count[t.id] = Math.max(0, (shared.count[t.id] || 0) - 1); saveProgress(t.id); }
  if (b.id === "reset") {
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Click again to reset for both of you"; setTimeout(() => { b.textContent = "Reset progress"; delete b.dataset.armed; }, 3000); return; }
    shared.done = {}; shared.count = {}; b.textContent = "Reset progress"; delete b.dataset.armed;
    await save(sb.from("progress").delete().neq("task_id", "")); toast("Progress reset"); render(); return;
  }
  if (b.id === "signout") { await sb.auth.signOut(); return; }
  if (!wasDone && stepDone(i)) toast(`${STEPS[i].badge} unlocked! +${STEPS[i].bonus} points`);
  render();
});

// ---------- sign in ----------
$("loginform").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("loginEmail").value.trim().toLowerCase(), msg = $("loginMsg"), btn = e.target.querySelector("button");
  btn.disabled = true; msg.className = "login-msg"; msg.textContent = "Sending…";
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  btn.disabled = false;
  if (error) { msg.className = "login-msg err"; msg.textContent = /only for the team|Database error/i.test(error.message) ? "This email isn't on the team list." : /rate limit/i.test(error.message) ? "Too many emails sent. Wait a bit and try again." : error.message; }
  else { msg.className = "login-msg ok"; msg.textContent = "Check your inbox and tap the link in the email. You can close this tab."; }
});

async function onSession(session) {
  if (!session) { me = null; if (channel) { sb.removeChannel(channel); channel = null; } $("app").hidden = true; $("login").hidden = false; return; }
  me = { id: session.user.id, email: (session.user.email || "").toLowerCase() };
  const { data: ok } = await sb.rpc("is_team");
  if (!ok) { await sb.auth.signOut(); $("loginMsg").className = "login-msg err"; $("loginMsg").textContent = "This email isn't on the team list."; return; }
  $("login").hidden = true; $("app").hidden = false; showPage();
  if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname);
  await loadAll(); subscribe();
}
let lastUser = undefined;
sb.auth.onAuthStateChange((_event, session) => {
  const uid = session?.user?.id || null;
  if (uid === lastUser) return; // token refresh etc.
  lastUser = uid;
  setTimeout(() => onSession(session), 0);
});
setInterval(() => { if (me) renderCountdown(); }, 60 * 1000);
