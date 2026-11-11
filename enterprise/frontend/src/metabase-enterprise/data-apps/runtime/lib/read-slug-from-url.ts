import { EMBEDDED_DATA_APP_PREFIX } from "embedding-sdk-shared/lib/embedded-data-app-path";
import { getMetabaseRootPath } from "embedding-sdk-shared/lib/get-current-metabase-instance-url";
import { DATA_APP_EMBED_PREFIX } from "metabase/urls/data-apps";

/**
 * Reads the requested data-app slug from the iframe URL.
 *
 * The BE serves this iframe at `/embed/(apps|embedded-apps)/:slug(/sub/route)`. Anything
 * after the `:slug` segment is owned by the bundle's own router and mirrored
 * back to the parent by `attachIframeUrlMirror` in `AppView`.
 */
export function readSlugFromUrl(): string | null {
  const root = getMetabaseRootPath();
  const pathname = window.location.pathname;

  const dataAppPrefix = [EMBEDDED_DATA_APP_PREFIX, DATA_APP_EMBED_PREFIX]
    .map((prefix) => `${root}${prefix}/`)
    .find((prefix) => pathname.startsWith(prefix));

  if (!dataAppPrefix) {
    return null;
  }

  const encodedSlug = pathname.slice(dataAppPrefix.length).split("/")[0];

  if (!encodedSlug) {
    return null;
  }

  try {
    return decodeURIComponent(encodedSlug);
  } catch {
    return null;
  }
}
