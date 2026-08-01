import type { Location as V7Location } from "react-router";

import type { Location as HistoryLocation } from "./types";

/**
 * Serialize a query object into the `search` string a navigation target carries.
 * Repeated values become repeated keys. Returns `""` for an empty query.
 *
 * Keys are sorted, because history@3 stringified the query with `query-string`,
 * which sorts by default. Call sites build the query from an object whose key
 * order is incidental, and the URL is user visible and asserted against, so the
 * order has to stay stable rather than follow insertion.
 */
export function queryToSearch(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const sortedEntries = Object.entries(query).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [key, value] of sortedEntries) {
    if (value == null) {
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      params.append(key, String(item));
    }
  }
  // `URLSearchParams` matches history@3 apart from `~`, which it escapes and
  // history@3 left alone. Both write a space as `+`. These URLs are user visible
  // and asserted against, so a date filter has to read `next30days~`.
  const search = params.toString().replace(/%7E/gi, "~");
  return search ? `?${search}` : "";
}

/**
 * Build the `Location` the facade context and the LOCATION_CHANGE payload expect
 * from a v7 location. All that is left to normalize is `state`, which the legacy
 * readers treat as absent when it is `undefined`.
 */
export function toFacadeLocation(location: V7Location): HistoryLocation {
  return {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    // v3 left state `undefined` when absent; v7 uses `null`. The readers test
    // for `undefined`, so normalize it here.
    state: location.state ?? undefined,
    key: location.key,
  };
}
