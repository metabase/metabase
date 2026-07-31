import * as Urls from "metabase/urls";

/**
 * Data-app pages open in a new top-level document (the admin list and the navbar
 * both link with `target="_blank"`). In cross-origin mode (`MB_DATA_APPS_HOST`) that
 * document must load on the `site-url` origin — its iframe's `frame-ancestors` and
 * the broker handshake are pinned there — so we link straight to it instead of
 * whatever origin the main app happens to be on.
 *
 * Returns the absolute URL, or null in same-origin mode (or when `site-url` is
 * missing/unparseable) so the caller keeps its own same-origin path — the two call
 * sites resolve the subpath differently (a raw `<a>` vs a router `Link` that adds
 * the basename), so only the cross-origin branch is shared.
 */
export function getCrossOriginDataAppHref(
  name: string,
  appsHost: string | null,
  siteUrl: string | null,
): string | null {
  if (!appsHost || !siteUrl) {
    return null;
  }

  try {
    return new URL(Urls.getSubpathSafeUrl(Urls.dataApp(name)), siteUrl).href;
  } catch {
    return null;
  }
}
