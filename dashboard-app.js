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
let state = { filter: "all", q: "", sort: "name", dir: 1, page: 1 };

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
  $("cards").innerHTML = `
    <div class="card polax"><h3>${SM.polax.name}</h3><div class="big">${SM.polax.offers}</div><div class="sub">${SM.polax.skus} unique SKUs</div></div>
    <div class="card mlot"><h3>${SM.mlot.name}</h3><div class="big">${SM.mlot.offers}</div><div class="sub">${SM.mlot.skus} unique SKUs</div></div>
    <div class="card sila"><h3>${SM.sila.name}</h3><div class="big">${SM.sila.offers}</div><div class="sub">${SM.sila.skus} unique SKUs</div></div>
    <div class="card"><h3>In all three</h3><div class="big">${c.all3}</div><div class="sub">of ${c.total} total products</div></div>`;

  const FILTERS = [
    { k: "all", t: "All (" + c.total + ")" },
    { k: "all3", t: "In all 3 (" + c.all3 + ")" },
    { k: "only_polax", t: "Only Polax (" + c.only_polax + ")" },
    { k: "only_mlot", t: "Only Mlot (" + c.only_mlot + ")" },
    { k: "only_sila", t: "Only Sila (" + c.only_sila + ")" },
    { k: "missing_polax", t: "Missing in Polax (" + c.missing_polax + ")" },
    { k: "missing_mlot", t: "Missing in Mlot (" + c.missing_mlot + ")" },
    { k: "missing_sila", t: "Missing in Sila (" + c.missing_sila + ")" },
    { k: "ean_mismatch", t: "⚠ EAN differs (" + c.ean_mismatch + ")" },
  ];
  const fEl = $("filters");
  fEl.innerHTML = "";
  FILTERS.forEach((f) => {
    const b = document.createElement("button");
    b.textContent = f.t;
    b.className = state.filter === f.k ? "active" : "";
    b.onclick = () => { state.filter = f.k; state.page = 1; [...fEl.children].forEach((x) => x.classList.remove("active")); b.classList.add("active"); render(); };
    fEl.appendChild(b);
  });

  $("search").addEventListener("input", (e) => { state.q = e.target.value.trim().toLowerCase(); state.page = 1; render(); });
  document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.sort; state.dir = state.sort === k ? -state.dir : 1; state.sort = k; render();
  }));

  const FILTER_LABEL = { all: "All", all3: "In-all-3", only_polax: "Only-Polax", only_mlot: "Only-Mlot", only_sila: "Only-Sila", missing_polax: "Missing-Polax", missing_mlot: "Missing-Mlot", missing_sila: "Missing-Sila", ean_mismatch: "EAN-differs" };
  $("dl").addEventListener("click", () => {
    const arr = filtered();
    if (!arr.length) { alert("Nothing to export with the current filters."); return; }
    const yn = (p, id) => (p.present.includes(id) ? "Y" : "N");
    const rows = arr.map((p) => ({
      SKU: p.sku, Name: p.name, EAN: p.ean, EAN_mismatch: p.eanMismatch ? "Y" : "",
      In_Polax: yn(p, "polax"), In_Mlot: yn(p, "mlot"), In_Sila: yn(p, "sila"), Stores: p.count,
      Polax_EAN: p.stores.polax?.ean ?? "", Polax_Price: p.stores.polax?.price ?? "", Polax_Stock: p.stores.polax?.stock ?? "",
      Mlot_EAN: p.stores.mlot?.ean ?? "", Mlot_Price: p.stores.mlot?.price ?? "", Mlot_Stock: p.stores.mlot?.stock ?? "",
      Sila_EAN: p.stores.sila?.ean ?? "", Sila_Price: p.stores.sila?.price ?? "", Sila_Stock: p.stores.sila?.stock ?? "",
      Price_Spread: p.spread ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), (FILTER_LABEL[state.filter] || "Report").slice(0, 31));
    const stamp = new Date().toISOString().slice(0, 10);
    const q = state.q ? "-q_" + state.q.replace(/[^a-z0-9]+/gi, "").slice(0, 20) : "";
    XLSX.writeFile(wb, `Allegro-3way-${FILTER_LABEL[state.filter] || "report"}${q}-${stamp}.xlsx`);
  });
}

const FILTER_FN = {
  all: () => true,
  all3: (p) => p.count === 3,
  only_polax: (p) => p.count === 1 && p.present[0] === "polax",
  only_mlot: (p) => p.count === 1 && p.present[0] === "mlot",
  only_sila: (p) => p.count === 1 && p.present[0] === "sila",
  missing_polax: (p) => !p.present.includes("polax"),
  missing_mlot: (p) => !p.present.includes("mlot"),
  missing_sila: (p) => !p.present.includes("sila"),
  ean_mismatch: (p) => p.eanMismatch,
};

const sortVal = (p, k) => ({
  name: p.name.toLowerCase(), sku: p.sku, ean: p.ean, count: p.count,
  polaxPrice: p.stores.polax?.price ?? -1, polaxStock: p.stores.polax?.stock ?? -1,
  mlotPrice: p.stores.mlot?.price ?? -1, mlotStock: p.stores.mlot?.stock ?? -1,
  silaPrice: p.stores.sila?.price ?? -1, silaStock: p.stores.sila?.stock ?? -1,
  spread: p.spread ?? -1,
})[k];

function filtered() {
  let arr = D.products.filter(FILTER_FN[state.filter]);
  if (state.q) arr = arr.filter((p) =>
    p.name.toLowerCase().includes(state.q) || (p.sku || "").toLowerCase().includes(state.q) ||
    p.eans.some((e) => e.includes(state.q)));
  return arr.slice().sort((a, b) => { const x = sortVal(a, state.sort), y = sortVal(b, state.sort); return (x < y ? -1 : x > y ? 1 : 0) * state.dir; });
}

const money = (o) => o && o.price != null ? o.price.toFixed(2) : '<span class="dash">—</span>';
const stk = (o) => o && o.stock != null ? o.stock : '<span class="dash">—</span>';
const where = (p) => ["polax", "mlot", "sila"].map((id) =>
  p.present.includes(id) ? `<span class="on-${id}">${id[0].toUpperCase()}</span>` : `<span class="off">${id[0].toUpperCase()}</span>`).join("");
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

  $("meta").textContent = `${arr.length} products · page ${state.page}/${pages}`;
  $("rows").innerHTML = slice.map((p) => `<tr>
    <td class="name">${link(p)}</td>
    <td class="sku">${p.sku}</td>
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
