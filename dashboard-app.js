// Private dashboard shell. Holds NO data — fetches it from a PRIVATE repo using
// a GitHub token the user pastes at runtime (kept in localStorage on this device).
// Without a valid token the page shows only the login form.
const CONFIG = {
  repo: "illia-ctrl/POLAX-Allegro", // private repo that stores the data
  path: "hosted-dashboard/data.json", // data file inside that repo
  tokenKey: "polax_dash_pat",
};

const $ = (id) => document.getElementById(id);
const PAGE = 50;
let D = null, SM = null;
let state = { stores: { polax: "any", mlot: "any", sila: "any" }, issues: [], q: "", sort: "name", dir: 1, page: 1 };

// ---------- auth + data loading ----------
async function fetchData(token) {
  const url = `https://api.github.com/repos/${CONFIG.repo}/contents/${CONFIG.path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github.raw",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 401) throw new Error("Invalid or expired token.");
  if (res.status === 403) throw new Error("Token lacks access (need Contents: Read on the repo).");
  if (res.status === 404) throw new Error("Data file not found in the private repo yet.");
  if (!res.ok) throw new Error("GitHub error " + res.status);
  return JSON.parse(await res.text());
}

async function tryLoad(token, remember) {
  D = await fetchData(token);
  SM = Object.fromEntries(D.storeMeta.map((s) => [s.id, s]));
  if (remember) localStorage.setItem(CONFIG.tokenKey, token);
  else sessionStorage.setItem(CONFIG.tokenKey, token);
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  initUI();
  render();
}

$("loginBtn").addEventListener("click", async () => {
  const token = $("pat").value.trim();
  const remember = $("remember").checked;
  if (!token) { $("loginErr").textContent = "Paste a token first."; return; }
  $("loginErr").textContent = "Loading…";
  try { await tryLoad(token, remember); }
  catch (e) { $("loginErr").textContent = e.message; }
});
$("pat").addEventListener("keydown", (e) => { if (e.key === "Enter") $("loginBtn").click(); });

$("lock").addEventListener("click", () => {
  localStorage.removeItem(CONFIG.tokenKey);
  sessionStorage.removeItem(CONFIG.tokenKey);
  location.reload();
});

// "Refresh now" — trigger the GitHub Action that re-pulls all three stores,
// then poll until the data changes and reload. Needs a Contents: write token.
const REFRESH_EVENT = "refresh-dashboard";
const setStatus = (msg) => { const el = $("status"); if (el) el.textContent = msg; };
$("refresh").addEventListener("click", async () => {
  const token = localStorage.getItem(CONFIG.tokenKey) || sessionStorage.getItem(CONFIG.tokenKey);
  if (!token) { setStatus("Load with a token first."); return; }
  const btn = $("refresh");
  btn.disabled = true;
  const before = D ? D.generated : null;
  setStatus("Starting refresh…");
  try {
    const r = await fetch(`https://api.github.com/repos/${CONFIG.repo}/dispatches`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ event_type: REFRESH_EVENT }),
    });
    if (r.status === 403 || r.status === 404) { setStatus("This token can't trigger refresh — it needs Contents: Read and write."); btn.disabled = false; return; }
    if (r.status !== 204) { setStatus("Could not start refresh (HTTP " + r.status + ")."); btn.disabled = false; return; }
  } catch (e) { setStatus("Network error: " + e.message); btn.disabled = false; return; }

  setStatus("Refreshing from Allegro… ~2–3 min. The page reloads automatically when ready.");
  const start = Date.now();
  const poll = async () => {
    try {
      const fresh = await fetchData(token);
      if (fresh.generated && fresh.generated !== before) { setStatus("Updated ✓ reloading…"); location.reload(); return; }
    } catch { /* keep waiting */ }
    if (Date.now() - start > 6 * 60 * 1000) { setStatus("Still running — try reloading in a minute."); btn.disabled = false; return; }
    setTimeout(poll, 20000);
  };
  setTimeout(poll, 30000);
});

// auto-load if a token is already stored
(async function boot() {
  const token = localStorage.getItem(CONFIG.tokenKey) || sessionStorage.getItem(CONFIG.tokenKey);
  if (!token) return;
  try { await tryLoad(token, !!localStorage.getItem(CONFIG.tokenKey)); }
  catch { /* show login */ }
})();

// ---------- UI (same view as the local dashboard) ----------
function initUI() {
  $("gen").textContent = "Loaded " + new Date(D.generated).toLocaleString() + " · from " + CONFIG.repo + " · matched by " + (D.matchKey || "SKU") + " (EAN shown for reference)";

  const c = D.counts;
  const storeCard = (m, cls) => `<div class="card ${cls}"><h3>${m.name}</h3><div class="big">${m.present}</div>` +
    `<div class="sub">products · ${m.offers} listings${m.dup ? ` (${m.dup} dup)` : ""} · ${m.missing} missing</div></div>`;
  $("cards").innerHTML =
    storeCard(SM.polax, "polax") + storeCard(SM.mlot, "mlot") + storeCard(SM.sila, "sila") +
    `<div class="card"><h3>Total products</h3><div class="big">${c.total}</div><div class="sub">active in all 3: ${c.all3} · in 2: ${c.in2} · in 1: ${c.in1}${c.in0 ? ` · ${c.in0} inactive-only` : ""}</div></div>`;

  // Multi-select: stores combine as an exact set (in all selected, not in the rest);
  // issue chips add AND constraints. Click again to deselect.
  const fEl = $("filters");
  function buildFilters() {
    fEl.innerHTML = "";
    STORE_IDS.forEach((id) => {
      const b = document.createElement("button");
      b.className = "store-chip"; b.dataset.store = id; b.style.setProperty("--c", STORE_COLOR[id]);
      const paint = () => { const st = state.stores[id]; b.dataset.state = st; b.textContent = STORE_LABEL[id] + STATUS_SYM[st]; };
      b.onclick = () => { state.stores[id] = STATES[(STATES.indexOf(state.stores[id]) + 1) % STATES.length]; state.page = 1; paint(); render(); };
      paint(); fEl.appendChild(b);
    });
    const sep = document.createElement("span"); sep.className = "sep"; fEl.appendChild(sep);
    ISSUE_CODES.forEach((code) => {
      const m = ISSUE_META[code];
      const b = document.createElement("button");
      b.className = "issue-chip"; b.title = m.t;
      const on = () => state.issues.includes(code);
      const paint = () => { b.classList.toggle("on", on()); b.style.color = on() ? m.c : ""; b.style.borderColor = on() ? m.c : ""; b.textContent = m.l + " (" + c["issue_" + code] + ")"; };
      b.onclick = () => { state.issues = on() ? state.issues.filter((x) => x !== code) : [...state.issues, code]; state.page = 1; paint(); render(); };
      paint(); fEl.appendChild(b);
    });
    const r = document.createElement("button"); r.className = "reset-btn"; r.textContent = "Reset";
    r.onclick = () => { STORE_IDS.forEach((i) => state.stores[i] = "any"); state.issues = []; state.q = ""; const si = $("search"); if (si) si.value = ""; state.page = 1; buildFilters(); render(); };
    fEl.appendChild(r);
  }
  buildFilters();

  $("search").addEventListener("input", (e) => { state.q = e.target.value.trim().toLowerCase(); state.page = 1; render(); });
  document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.sort; state.dir = state.sort === k ? -state.dir : 1; state.sort = k; render();
  }));

  $("dl").addEventListener("click", () => {
    const arr = filtered();
    if (!arr.length) { alert("Nothing to export with the current filters."); return; }
    const yn = (p, id) => lst(p, id);
    const rows = arr.map((p) => ({
      SKU: p.sku, Name: p.name, Issues: p.issues.join("|"), EAN: p.ean, EAN_mismatch: p.eanMismatch ? "Y" : "",
      Status_Polax: yn(p, "polax"), Status_Mlot: yn(p, "mlot"), Status_Sila: yn(p, "sila"), Active_stores: p.count,
      Polax_EAN: p.stores.polax?.ean ?? "", Polax_Price: p.stores.polax?.price ?? "", Polax_Stock: p.stores.polax?.stock ?? "",
      Mlot_EAN: p.stores.mlot?.ean ?? "", Mlot_Price: p.stores.mlot?.price ?? "", Mlot_Stock: p.stores.mlot?.stock ?? "",
      Sila_EAN: p.stores.sila?.ean ?? "", Sila_Price: p.stores.sila?.price ?? "", Sila_Stock: p.stores.sila?.stock ?? "",
      Price_Spread: p.spread ?? "",
    }));
    const _sel = STORE_IDS.filter((i) => state.stores[i] !== "any").map((i) => STORE_LABEL[i] + "-" + state.stores[i]);
    const slug = ([_sel.join("_"), state.issues.join("-"), state.q ? "q_" + state.q.replace(/[^a-z0-9]+/gi, "") : ""].filter(Boolean).join("_") || "All").slice(0, 28);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), slug.slice(0, 31));
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Allegro-3way-${slug}-${stamp}.xlsx`);
  });
}

const STORE_IDS = ["polax", "mlot", "sila"], STORE_LABEL = { polax: "Polax", mlot: "Mlot", sila: "Sila" };
const STORE_COLOR = { polax: "#2563eb", mlot: "#ea580c", sila: "#7c3aed" };
// Per-store listing status filter: any → active → inactive (draft) → ended → none.
const STATES = ["any", "active", "inactive", "ended", "absent"];
const STATUS_SYM = { any: "", active: " ✓", inactive: " ◌", ended: " ⊘", absent: " ✗" };
const STATUS_TIP = { active: "listing active (buyable)", inactive: "listing exists but INACTIVE (draft)", ended: "listing ENDED", absent: "no listing" };
const lst = (p, id) => (p.listing && p.listing[id]) || "absent";
const ISSUE_CODES = ["dup", "ean", "name", "pid"];
function matches(p) {
  for (const id of STORE_IDS) { const st = state.stores[id]; if (st !== "any" && lst(p, id) !== st) return false; }
  for (const code of state.issues) if (!p.issues.includes(code)) return false;
  if (state.q) {
    const q = state.q;
    if (!(p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q) || p.eans.some((e) => e.includes(q)))) return false;
  }
  return true;
}
function describe() {
  const parts = [];
  for (const id of STORE_IDS) { const st = state.stores[id]; if (st !== "any") parts.push(STORE_LABEL[id] + " " + st); }
  if (state.issues.length) parts.push(state.issues.map((x) => ISSUE_META[x].l).join("+"));
  if (state.q) parts.push("“" + state.q + "”");
  return parts.length ? parts.join(" · ") : "all products";
}

const ISSUE_META = {
  dup: { l: "DUP", c: "#dc2626", t: "SKU duplicated within a store" },
  ean: { l: "EAN", c: "#d97706", t: "EAN differs across stores" },
  name: { l: "NAME", c: "#7c3aed", t: "Same SKU, different product names" },
  pid: { l: "PID", c: "#0891b2", t: "Same SKU, different Allegro product.id" },
};
const chips = (p) => p.issues.map((code) => {
  const m = ISSUE_META[code];
  return `<span class="chip" style="background:${m.c}22;color:${m.c}" title="${m.t}">${m.l}</span>`;
}).join("") || '<span class="dash">—</span>';

const sortVal = (p, k) => ({
  name: p.name.toLowerCase(), sku: p.sku, ean: p.ean, count: p.count, issues: p.issues.length,
  polaxPrice: p.stores.polax?.price ?? -1, polaxStock: p.stores.polax?.stock ?? -1,
  mlotPrice: p.stores.mlot?.price ?? -1, mlotStock: p.stores.mlot?.stock ?? -1,
  silaPrice: p.stores.sila?.price ?? -1, silaStock: p.stores.sila?.stock ?? -1,
  spread: p.spread ?? -1,
})[k];

function filtered() {
  return D.products.filter(matches).slice().sort((a, b) => { const x = sortVal(a, state.sort), y = sortVal(b, state.sort); return (x < y ? -1 : x > y ? 1 : 0) * state.dir; });
}

const money = (o) => o && o.price != null ? o.price.toFixed(2) : '<span class="dash">—</span>';
const stk = (o) => o && o.stock != null ? o.stock : '<span class="dash">—</span>';
const where = (p) => ["polax", "mlot", "sila"].map((id) => {
  const st = lst(p, id);
  return `<span class="ind ${st}" style="--c:${STORE_COLOR[id]}" title="${STORE_LABEL[id]}: ${STATUS_TIP[st]}">${id[0].toUpperCase()}</span>`;
}).join("");
const eanCell = (p) => p.ean
  ? p.ean + (p.eanMismatch ? ` <span class="warn" title="EANs differ across stores: ${p.eans.join(", ")}">⚠</span>` : "")
  : '<span class="dash">—</span>';
const link = (p) => {
  const o = p.stores.polax || p.stores.mlot || p.stores.sila;
  return o ? `<a href="https://allegro.pl/oferta/${o.offerId}" target="_blank" rel="noopener">${p.name}</a>` : p.name;
};

function render() {
  const arr = filtered();
  const pages = Math.max(1, Math.ceil(arr.length / PAGE));
  state.page = Math.min(state.page, pages);
  const slice = arr.slice((state.page - 1) * PAGE, state.page * PAGE);

  $("meta").textContent = `${describe()} · ${arr.length} products · page ${state.page}/${pages}`;
  $("rows").innerHTML = slice.map((p) => `<tr>
    <td class="name">${link(p)}</td>
    <td class="sku">${p.sku}</td>
    <td>${chips(p)}</td>
    <td class="ean">${eanCell(p)}</td>
    <td class="where">${where(p)}</td>
    <td class="num">${money(p.stores.polax)}</td><td class="num">${stk(p.stores.polax)}</td>
    <td class="num">${money(p.stores.mlot)}</td><td class="num">${stk(p.stores.mlot)}</td>
    <td class="num">${money(p.stores.sila)}</td><td class="num">${stk(p.stores.sila)}</td>
    <td class="num">${p.spread == null ? '<span class="dash">—</span>' : p.spread.toFixed(2)}</td>
  </tr>`).join("");

  const pager = $("pager");
  pager.innerHTML = "";
  const mk = (txt, pg, dis) => { const b = document.createElement("button"); b.textContent = txt; b.disabled = dis; b.onclick = () => { state.page = pg; render(); window.scrollTo(0, 0); }; return b; };
  pager.appendChild(mk("← Prev", state.page - 1, state.page <= 1));
  const lbl = document.createElement("span"); lbl.textContent = ` ${state.page} / ${pages} `; pager.appendChild(lbl);
  pager.appendChild(mk("Next →", state.page + 1, state.page >= pages));
}
