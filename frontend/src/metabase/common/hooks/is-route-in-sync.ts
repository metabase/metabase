import { getPathnameWithoutSubPath } from "metabase/utils/dom";
import { isWithinIframe } from "metabase/utils/iframe";

/**
 * Returns whether the current route is in sync with the given pathname,
 * only if we're in an iframe context.
 *
 * This has been implemented as part of a fix for metabase#65500
 * to prevent iframes navigated through postMessage from getting stuck in an error state
 *
 * @param pathname the current path name
 * @returns whether the routes are in sync, if we're in an iframe context
 */
export function isRouteInSync(pathname: string): boolean {
  const isRouteInSync =
    getPathnameWithoutSubPath(window.location.pathname) === pathname;

  if (isWithinIframe()) {
    return isRouteInSync;
  }

  return true;
}
