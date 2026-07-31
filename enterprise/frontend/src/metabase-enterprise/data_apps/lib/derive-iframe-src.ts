import * as Urls from "metabase/urls";
import { DATA_APP_IFRAME_BROKER_HASH_KEY } from "metabase-enterprise/data_apps/constants";

/**
 * Maps the parent's `/apps/:name(/sub/route)` path to the iframe's
 * `/embed/apps/:name(/sub/route)` path.
 *
 * The sub-path is read from `window.location.pathname` at component init
 * (it is later changed *from inside the iframe*, never from the parent's
 * own URL — we intentionally don't re-sync the parent → iframe direction
 * after initial mount). Trailing characters after the name segment are
 * preserved verbatim.
 *
 * When `appsHost` is set (`MB_DATA_APPS_HOST`), the iframe is served cross-origin
 * from that host so the sandbox can't see the session cookie. The host's own origin
 * is written into the URL hash so the iframe knows — synchronously at boot — to
 * broker its instance traffic (see `broker/iframe-broker`); the hash never reaches
 * the server and the SPA router ignores it.
 */
export function deriveIframeSrc(
  name: string,
  appsHost?: string | null,
): string {
  const prefix = Urls.dataApp(name);
  const path = window.location.pathname;
  const index = path.indexOf(prefix);
  const tail = index >= 0 ? path.slice(index + prefix.length) : "";
  const embedPath = `${Urls.DATA_APP_EMBED_PREFIX}/${encodeURIComponent(name)}${tail}`;
  const safePath = Urls.getSubpathSafeUrl(embedPath);

  if (appsHost) {
    const hash = `#${DATA_APP_IFRAME_BROKER_HASH_KEY}=${encodeURIComponent(window.location.origin)}`;

    return `${new URL(appsHost).origin}${safePath}${hash}`;
  }

  return safePath;
}
