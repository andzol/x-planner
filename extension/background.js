// Service worker: talks to the GitHub API so the token never touches x.com pages.
const BRANCH = "master";
const PLANNER_URL = "https://andzol.github.io/x-planner/";

async function settings() {
  return chrome.storage.local.get({ repo: "andzol/x-wisdom-scheduler", token: "" });
}

async function gh(s, path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${s.repo}/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${s.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) },
  });
  if (!r.ok) { const e = new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 160)}`); e.status = r.status; throw e; }
  return r;
}

const b64utf8 = (str) => { const b = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
const utf8b64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

async function getRaw(s, path) {
  return (await gh(s, `contents/${path}?ref=${BRANCH}`, { headers: { Accept: "application/vnd.github.raw" } })).text();
}
async function getPosts(s) {
  const j = await (await gh(s, `contents/planner/posts.json?ref=${BRANCH}`)).json();
  return { posts: JSON.parse(j.content ? utf8b64(j.content) : await getRaw(s, "planner/posts.json")).posts, sha: j.sha };
}

function nowIn(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}
function addDays(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// first empty slot that is still at least 3 minutes away, so the post never lands in a slot that is firing right now
function nextFree(posts, cfg) {
  const taken = new Set(posts.filter((p) => p.date && p.slot).map((p) => `${p.date}|${p.slot}`));
  const soon = new Date(Date.now() + 3 * 60 * 1000);
  const n = nowIn(cfg.timezone);
  const cutoff = (() => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: cfg.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(soon).map((x) => [x.type, x.value])); return `${p.hour === "24" ? "00" : p.hour}:${p.minute}`; })();
  for (let i = 0; i < 400; i++) {
    const d = addDays(n.date, i);
    for (const s of cfg.slots) {
      if (i === 0 && s <= cutoff) continue;
      if (!taken.has(`${d}|${s}`)) return { date: d, slot: s };
    }
  }
  throw new Error("no free slot in the next 400 days");
}

async function schedule({ text, media }) {
  const s = await settings();
  if (!s.token) { chrome.runtime.openOptionsPage(); throw new Error("Add your GitHub token in the extension settings first"); }
  const cfg = JSON.parse(await getRaw(s, "planner/config.json"));
  const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const uploaded = [];
  for (const [i, m] of media.entries()) {
    const ext = (m.type.split("/")[1] || "bin").replace("jpeg", "jpg").replace("quicktime", "mov");
    const path = `media/${id}-${i}.${ext}`;
    await gh(s, `contents/planner/${path}`, { method: "PUT", body: JSON.stringify({ message: `planner: add ${path}`, branch: BRANCH, content: m.data }) });
    uploaded.push({ path, type: m.type.startsWith("video/") ? "video" : "image" });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const { posts, sha } = await getPosts(s);
    const at = nextFree(posts, cfg);
    posts.push({ id, date: at.date, slot: at.slot, kind: "post", text, media: uploaded });
    try {
      await gh(s, "contents/planner/posts.json", { method: "PUT", body: JSON.stringify({ message: `planner: schedule ${id} for ${at.date} ${at.slot}`, branch: BRANCH, sha, content: b64utf8(JSON.stringify({ posts }, null, 1) + "\n") }) });
      return { ...at, timezone: cfg.timezone, planner: PLANNER_URL };
    } catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e; // someone saved in between: reload and retry
    }
  }
  throw new Error("posts.json kept changing, try again");
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "xps-schedule") return;
  schedule(msg).then((r) => reply({ ok: true, ...r }), (e) => reply({ ok: false, error: e.message }));
  return true; // async reply
});
