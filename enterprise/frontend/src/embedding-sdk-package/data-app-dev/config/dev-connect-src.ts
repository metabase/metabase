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
  const formAction =
    allowedHosts.length > 0 ? allowedHosts.join(" ") : "'none'";
  const frameSrc = ["'self'", ...allowedHosts].join(" ");

  return `connect-src ${sources.join(" ")}; form-action ${formAction}; frame-src ${frameSrc}`;
};
