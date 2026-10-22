import { EMBEDDED_DATA_APP_PREFIX } from "embedding-sdk-shared/lib/data-app-embed";
import { DATA_APP_EMBED_PREFIX } from "metabase/urls/data-apps";

/** Read the app name from either runtime route, before any app-owned subpath. */
export function readNameFromUrl(): string | null {
  const root = (window.MetabaseRoot ?? "/").replace(/\/+$/, "");
  const pathname = window.location.pathname;
  const prefix = [EMBEDDED_DATA_APP_PREFIX, DATA_APP_EMBED_PREFIX]
    .map((prefix) => `${root}${prefix}/`)
    .find((prefix) => pathname.startsWith(prefix));

  if (!prefix) {
    return null;
  }

  return (
    decodeURIComponent(pathname.slice(prefix.length).split("/")[0] ?? "") ||
    null
  );
}
