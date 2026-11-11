import * as Urls from "metabase/urls";

/**
 * Maps the parent's `/apps/:slug(/sub/route)` path to the iframe's
 * `/embed/apps/:slug(/sub/route)` path.
 *
 * The sub-path is read from `window.location.pathname` at component init
 * (it is later changed *from inside the iframe*, never from the parent's
 * own URL — we intentionally don't re-sync the parent → iframe direction
 * after initial mount). Trailing characters after the slug segment are
 * preserved verbatim.
 *
 * With `isolatedOrigin` (from `MB_ISOLATED_ORIGIN`), the iframe is served from that origin.
 */
export function deriveIframeSrc(
  slug: string,
  isolatedOrigin: string | null,
): string {
  const prefix = Urls.dataApp(slug);
  const path = window.location.pathname;
  const index = path.indexOf(prefix);
  const tail = index >= 0 ? path.slice(index + prefix.length) : "";
  const embedPath = `${Urls.DATA_APP_EMBED_PREFIX}/${encodeURIComponent(slug)}${tail}`;
  const safePath = Urls.getSubpathSafeUrl(embedPath);

  return isolatedOrigin ? `${isolatedOrigin}${safePath}` : safePath;
}
