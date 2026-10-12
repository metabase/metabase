import { b64url_to_utf8, utf8_to_b64url } from "metabase/utils/encoding";
import { isRecord } from "metabase-types/guards";

/*
 * Stored settings live in the URL hash as base64url JSON, like the metrics
 * viewer's state. They're sparse and JSON-safe, so no compact schema or date
 * revival is needed.
 */

export const encodeSettings = (stored: object): string =>
  Object.keys(stored).length > 0 ? utf8_to_b64url(JSON.stringify(stored)) : "";

/** Untrusted: the settings engine validates each value and falls back to its default. */
export const decodeSettings = (hash: string): Record<string, unknown> => {
  if (hash === "") {
    return {};
  }
  try {
    const decoded: unknown = JSON.parse(b64url_to_utf8(hash));
    return isRecord(decoded) ? decoded : {};
  } catch {
    return {};
  }
};
