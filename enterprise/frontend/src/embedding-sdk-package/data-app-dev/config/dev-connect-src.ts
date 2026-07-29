const toOrigin = (url: string | undefined): string | undefined => {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
};

export const buildDevCsp = (
  allowedHosts: string[],
  metabaseUrl: string | undefined,
): string => {
  const instanceOrigin = toOrigin(metabaseUrl);
  const sources = [
    "'self'",
    "ws://localhost:*",
    "wss://localhost:*",
    "ws://127.0.0.1:*",
    "wss://127.0.0.1:*",
    ...(instanceOrigin ? [instanceOrigin] : []),
    ...allowedHosts,
  ];

  // Match the production iframe CSP
  return `connect-src ${sources.join(" ")}; form-action 'none'; frame-src 'none'`;
};
