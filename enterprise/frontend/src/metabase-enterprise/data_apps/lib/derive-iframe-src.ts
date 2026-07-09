import * as Urls from "metabase/urls";

/**
 * Maps the parent's `/apps/:name(/sub/route)` path to the iframe's
 * `/embed/apps/:name(/sub/route)` path.
 *
 * The sub-path is read from `window.location.pathname` at component init
 * (it is later changed *from inside the iframe*, never from the parent's
 * own URL — we intentionally don't re-sync the parent → iframe direction
 * after initial mount). Trailing characters after the name segment are
 * preserved verbatim.
 */
export function deriveIframeSrc(name: string): string {
  const prefix = Urls.dataApp(name);
  const path = window.location.pathname;
  const index = path.indexOf(prefix);
  const tail = index >= 0 ? path.slice(index + prefix.length) : "";

  return Urls.getSubpathSafeUrl(
    `${Urls.DATA_APP_EMBED_PREFIX}/${encodeURIComponent(name)}${tail}`,
  );
}
