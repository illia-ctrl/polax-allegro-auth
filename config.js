// Public configuration for the Allegro authorization page.
// NOTE: client_id is a PUBLIC identifier (not a secret) — safe to ship in the page.
// No client secret ever appears here; PKCE removes the need for it.
window.ALLEGRO_CONFIG = {
  authUrl: "https://allegro.pl/auth/oauth/authorize",

  // The exact page Allegro redirects back to. Must be registered in each Allegro
  // app as the redirect URI, character-for-character.
  // Page is hosted in a dedicated PUBLIC repo (illia-ctrl/polax-allegro-auth)
  // because GitHub Pages is not available on a private repo on the free plan.
  redirectUri: "https://illia-ctrl.github.io/polax-allegro-auth/callback.html",

  // The mini-backend that exchanges the code (PKCE) and writes the token to GitHub.
  // Fill in after deploying allegro-auth/ to Vercel, e.g.
  // "https://allegro-auth.vercel.app/api/exchange".
  backendUrl: "REPLACE_WITH_YOUR_VERCEL_URL/api/exchange",

  stores: [
    { key: "IL_READ",       label: "IL_read",        clientId: "b4c262586c54435ca6682884a96233ad" },
    { key: "IL_READ_POLAX", label: "IL_READ_POLAX",  clientId: "afcccf2ecf144e2b896a0d013f62e921" },
    { key: "IL_READ_MLOT",  label: "IL_READ_MLOT",   clientId: "1530d49935e143b8ade9b492b386b5ee" },
  ],
};
