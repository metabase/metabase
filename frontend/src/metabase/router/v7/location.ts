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
 */
export function queryToSearch(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
    } else {
      params.append(key, String(value));
    }
  }
  const search = params.toString();
  return search ? `?${search}` : "";
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
