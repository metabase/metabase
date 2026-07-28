import { getBasename } from "metabase/utils/basename";
import { isSameOrSiteUrlOrigin } from "metabase/utils/dom";

/** Paths that are handled by the backend server, not the frontend SPA router. */
export const BACKEND_ONLY_PATH_PREFIXES = ["/oauth/", "/auth/sso/"];

export const isBackendOnlyPath = (path: string): boolean =>
  BACKEND_ONLY_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));

export const getRedirectUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const redirectUrlParam = params.get("redirect");

  return redirectUrlParam != null && isSameOrSiteUrlOrigin(redirectUrlParam)
    ? redirectUrlParam
    : "/";
};

/**
 * A redirect target arrives in one of two shapes: an absolute URL
 * (`https://host/metabase/x`, `//host/x`) whose pathname is already what the
 * browser sees, or a basename-relative path (`/oauth/x`, sloppily `oauth/x`) —
 * the convention for every SPA path, including the backend's login redirect
 * (the server sits behind the prefix-stripping proxy and never sees the
 * subpath). Normalize to a browser-real URL.
 */
const toBrowserUrl = (url: string) => {
  const hasExplicitOrigin = /^[a-z][a-z0-9+.-]*:|^\/\//i.test(url);
  // String-join for paths, not URL resolution: a leading "/" is *root*-relative
  // and would discard the basename from a URL base.
  return hasExplicitOrigin
    ? new URL(url, window.location.origin)
    : new URL(
        `${getBasename()}/${url.replace(/^\//, "")}`,
        window.location.origin,
      );
};

/** The inverse: strip the basename back off for the SPA router, which prepends
 * it itself (and for prefix checks like `isBackendOnlyPath`). */
const toRouterPath = ({ pathname, search, hash }: URL) => {
  const basename = getBasename();
  const relativePathname =
    basename && pathname.startsWith(`${basename}/`)
      ? pathname.slice(basename.length)
      : pathname;
  return `${relativePathname}${search}${hash}`;
};

/**
 * `getRedirectUrl` accepts site-url-origin targets as well as same-origin ones,
 * so it can hand back an absolute URL. The SPA router only understands in-app
 * paths, so split the target into the path to navigate to and whether the SPA
 * can serve that origin at all.
 */
export const resolveRedirectTarget = (url: string) => {
  const target = toBrowserUrl(url);

  return {
    // Absolute, so a full-page redirect is not re-resolved against the current
    // path (a bare `auth/sso/x` would otherwise land under `/auth/login`).
    href: target.href,
    path: toRouterPath(target),
    isInAppOrigin: target.origin === window.location.origin,
  };
};
