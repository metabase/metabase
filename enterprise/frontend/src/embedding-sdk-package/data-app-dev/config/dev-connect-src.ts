/**
 * The preview page's CSP. Its requests reach the instance through the dev server's relay on its own origin, so the
 * instance isn't in `connect-src`: a direct request couldn't carry the key, but it would carry the developer's own
 * Metabase cookies.
 */
export const buildDevCsp = (allowedHosts: string[]): string => {
  const sources = [
    "'self'",
    "ws://localhost:*",
    "wss://localhost:*",
    "ws://127.0.0.1:*",
    "wss://127.0.0.1:*",
    ...allowedHosts,
  ];

  // Match the production iframe CSP
  return `connect-src ${sources.join(" ")}; form-action 'none'; frame-src 'none'`;
};
