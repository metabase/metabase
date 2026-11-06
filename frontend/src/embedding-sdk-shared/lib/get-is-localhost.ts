export const getIsLocalhost = (hostname = window.location.hostname) => {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
};

/** Check the browser-supplied message origin, including opaque origins. */
export function getIsLocalhostOrigin(origin: string | null): boolean {
  if (!origin) {
    return false;
  }

  try {
    return getIsLocalhost(new URL(origin).hostname);
  } catch {
    return false;
  }
}
