import * as Urls from "metabase/urls";
import {
  DATA_APP_IFRAME_BROKER_HASH_KEY,
  DATA_APP_IFRAME_LOCALE_HASH_KEY,
} from "metabase-enterprise/data-apps/constants";

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
 * With `isolatedOrigin` (from `MB_ISOLATED_ORIGIN`), the iframe is served from that origin,
 * and this page's origin and the user's locale go into the hash (see
 * `DATA_APP_IFRAME_BROKER_HASH_KEY` and `DATA_APP_IFRAME_LOCALE_HASH_KEY`).
 */
export function deriveIframeSrc(
  name: string,
  isolatedOrigin: string | null,
): string {
  const prefix = Urls.dataApp(name);
  const path = window.location.pathname;
  const index = path.indexOf(prefix);
  const tail = index >= 0 ? path.slice(index + prefix.length) : "";
  const embedPath = `${Urls.DATA_APP_EMBED_PREFIX}/${encodeURIComponent(name)}${tail}`;
  const safePath = Urls.getSubpathSafeUrl(embedPath);

  if (isolatedOrigin) {
    const hash = new URLSearchParams({
      [DATA_APP_IFRAME_BROKER_HASH_KEY]: window.location.origin,
    });
    const userLocale = window.MetabaseLocales?.user;
    if (userLocale) {
      hash.set(DATA_APP_IFRAME_LOCALE_HASH_KEY, userLocale);
    }

    return `${isolatedOrigin}${safePath}#${hash}`;
  }

  return safePath;
}
