import { getPathnameWithoutSubPath, isWithinIframe } from "metabase/lib/dom";

/**
 * Returns whether the current route is in sync with the given pathname,
 * only if we're in an iframe context.
 *
 * @param pathname the current path name
 * @returns whether the routes are in sync, if we're in an iframe context
 */
export function isRouteInSync(pathname: string): boolean {
  const isRouteInSync =
    getPathnameWithoutSubPath(window.location.pathname) === pathname;

  if (isWithinIframe() && !isRouteInSync) {
    return false;
  }

  return true;
}
