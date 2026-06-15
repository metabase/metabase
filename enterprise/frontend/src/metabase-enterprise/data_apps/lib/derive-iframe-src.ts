import { getSubpathSafeUrl } from "metabase/urls";

import { DATA_APP_EMBED_PREFIX } from "../constants";

/**
 * Maps the parent's `/data-app/:name(/sub/route)` path to the iframe's
 * `/embed/data-app/:name(/sub/route)` path.
 *
 * The sub-path is read from `window.location.pathname` at component init
 * (it is later changed *from inside the iframe*, never from the parent's
 * own URL — we intentionally don't re-sync the parent → iframe direction
 * after initial mount). Trailing characters after the name segment are
 * preserved verbatim.
 */
export function deriveIframeSrc(name: string): string {
  const prefix = `/data-app/${encodeURIComponent(name)}`;
  const path = window.location.pathname;
  const index = path.indexOf(prefix);
  const tail = index >= 0 ? path.slice(index + prefix.length) : "";

  return getSubpathSafeUrl(
    `${DATA_APP_EMBED_PREFIX}/${encodeURIComponent(name)}${tail}`,
  );
}
