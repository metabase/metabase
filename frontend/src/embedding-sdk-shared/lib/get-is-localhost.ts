import { isLoopbackHostname } from "metabase/utils/dom";

export const getIsLocalhost = (hostname = window.location.hostname) =>
  isLoopbackHostname(hostname);

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
