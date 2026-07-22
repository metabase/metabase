import type { Location as HistoryLocation } from "history";
import type { Location as V7Location } from "react-router-v7";

/**
 * Parse a search string into v3's `location.query` object: repeated keys become
 * an array, an empty value stays `""`, matching history@3's default parser that
 * the `location.query` readers were written against.
 */
export function searchToQuery(
  search: string,
): Record<string, string | string[]> {
  const params = new URLSearchParams(search);
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    query[key] = values.length > 1 ? values : values[0];
  }
  return query;
}

/**
 * Serialize v3's `location.query` object back into a search string, the only form
 * v7 understands. Repeated values become repeated keys, mirroring what
 * `searchToQuery` parses. Returns `""` for an empty query.
 *
 * Keys are sorted, because history@3 stringified the query with `query-string`,
 * which sorts by default. Call sites build the query from an object whose key
 * order is incidental, and the URL is user visible and asserted against, so the
 * order has to stay stable rather than follow insertion.
 */
export function queryToSearch(query: Record<string, unknown>): string {
  const pairs: string[] = [];
  const sortedEntries = Object.entries(query).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [key, value] of sortedEntries) {
    if (value == null) {
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      pairs.push(`${encodeQueryPart(key)}=${encodeQueryPart(String(item))}`);
    }
  }
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

/**
 * `encodeURIComponent`, as history@3 used, rather than `URLSearchParams`. The
 * latter also escapes `~!*'()` and writes a space as `+`, which would change URLs
 * users see and share (a date filter reads `next30days~`, not `next30days%7E`).
 */
function encodeQueryPart(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Build the v3-shaped `history` location the facade context and `state.routing`
 * expect from a v7 location plus the current navigation type.
 */
export function toV3Location(
  location: V7Location,
  action: HistoryLocation["action"],
): HistoryLocation {
  return {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    // v3 leaves state `undefined` when absent; v7 uses `null`.
    state: location.state ?? undefined,
    key: location.key,
    query: searchToQuery(location.search),
    action,
  };
}
