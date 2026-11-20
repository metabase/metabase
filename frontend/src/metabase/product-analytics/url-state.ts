import { b64url_to_utf8, utf8_to_b64url } from "metabase/utils/encoding";
import { isObject } from "metabase-types/guards";

/* Stored settings live in the URL hash as base64url JSON. */

/**
 * Never empty, even for empty settings: an empty hash means "no unsaved
 * edits", which differs from clearing every saved setting.
 */
export const encodeSettings = (stored: object): string =>
  utf8_to_b64url(JSON.stringify(stored));

/** Untrusted: each setting's `isValid` checks its value. */
export const decodeSettings = (hash: string): Record<string, unknown> => {
  if (hash === "") {
    return {};
  }
  try {
    const decoded: unknown = JSON.parse(b64url_to_utf8(hash));
    return isObject(decoded) && !Array.isArray(decoded) ? decoded : {};
  } catch {
    return {};
  }
};
