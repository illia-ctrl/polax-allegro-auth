// PKCE helpers + flow start. Runs entirely in the browser, no Allegro secret.

function base64url(bytes) {
  let s = btoa(String.fromCharCode.apply(null, bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return base64url(a);
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// Start authorization for one store: build the PKCE pair, stash the verifier,
// then send the browser to Allegro's login.
async function startAuth(store) {
  const cfg = window.ALLEGRO_CONFIG;
  const s = cfg.stores.find((x) => x.key === store);
  if (!s) throw new Error("Unknown store " + store);

  const pat = (document.getElementById("pat") || {}).value || sessionStorage.getItem("github_pat");
  if (!pat) {
    alert("Paste your GitHub token first — it is needed to store the token via GitHub Actions.");
    return;
  }
  sessionStorage.setItem("github_pat", pat);

  const verifier = randomVerifier();
  const challenge = await challengeFor(verifier);
  const state = randomVerifier(); // reuse as CSRF nonce

  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("pkce_state", state);
  sessionStorage.setItem("pkce_store", store);

  const url = new URL(cfg.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", s.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  window.location.assign(url.toString());
}

// Render the store buttons + wire up the PAT field.
function init() {
  const cfg = window.ALLEGRO_CONFIG;
  const root = document.getElementById("stores");
  cfg.stores.forEach((s) => {
    const row = document.createElement("div");
    row.className = "store";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = s.label;
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Authorize";
    btn.onclick = () => startAuth(s.key);
    row.appendChild(name);
    row.appendChild(btn);
    root.appendChild(row);
  });

  const patInput = document.getElementById("pat");
  const saved = document.getElementById("patSaved");
  if (patInput) {
    const existing = sessionStorage.getItem("github_pat");
    if (existing) { patInput.value = existing; if (saved) saved.style.display = "block"; }
    patInput.addEventListener("input", () => {
      sessionStorage.setItem("github_pat", patInput.value.trim());
      if (saved) saved.style.display = patInput.value ? "block" : "none";
    });
  }
}

window.AllegroAuth = { startAuth, init };
