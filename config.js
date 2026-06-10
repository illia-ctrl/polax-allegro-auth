// Public configuration for the Allegro authorization page.
// NOTE: client_id is a PUBLIC identifier (not a secret) — safe to ship in the page.
// PKCE removes the need for the client secret entirely.
window.ALLEGRO_CONFIG = {
  authUrl: "https://allegro.pl/auth/oauth/authorize",

  // Exact page Allegro redirects back to. Registered in each Allegro app.
  redirectUri: "https://illia-ctrl.github.io/polax-allegro-auth/callback.html",

  // The PRIVATE repo whose GitHub Actions exchange the code and store the token.
  dispatchRepo: "illia-ctrl/POLAX-Allegro",
  // repository_dispatch event type (must match the workflow's `on.repository_dispatch.types`).
  eventType: "allegro-auth",

  stores: [
    { key: "IL_READ",       label: "IL_read",        clientId: "b4c262586c54435ca6682884a96233ad" },
    { key: "IL_READ_POLAX", label: "IL_READ_POLAX",  clientId: "afcccf2ecf144e2b896a0d013f62e921" },
    { key: "IL_READ_MLOT",  label: "IL_READ_MLOT",   clientId: "1530d49935e143b8ade9b492b386b5ee" },
  ],
};
