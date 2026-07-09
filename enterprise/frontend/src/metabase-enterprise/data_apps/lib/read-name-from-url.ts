import * as Urls from "metabase/urls";

/**
 * Reads the requested data-app name from the iframe URL.
 *
 * The BE serves this iframe at `/embed/apps/:name(/sub/route)`. Anything
 * after the `:name` segment is owned by the bundle's own router and mirrored
 * back to the parent by `attachIframeUrlMirror` in `AppView`.
 */
export function readNameFromUrl(): string | null {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const index = segments.indexOf(Urls.DATA_APP_URL_SEGMENT);

  if (index < 0 || index === segments.length - 1) {
    return null;
  }

  return decodeURIComponent(segments[index + 1] ?? "");
}
