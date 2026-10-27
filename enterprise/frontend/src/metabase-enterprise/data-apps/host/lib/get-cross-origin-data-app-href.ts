import * as Urls from "metabase/urls";

/**
 * The URL that opens data app `name` in a new tab in cross-origin mode: the app page on
 * the site URL's origin, the only origin that may frame the app. Null in same-origin
 * mode, or when `siteUrl` is missing or unparseable.
 */
export function getCrossOriginDataAppHref(
  name: string,
  isolatedOrigin: string | null,
  siteUrl: string | null,
): string | null {
  if (!isolatedOrigin || !siteUrl) {
    return null;
  }

  try {
    return new URL(Urls.getSubpathSafeUrl(Urls.dataApp(name)), siteUrl).href;
  } catch {
    return null;
  }
}
