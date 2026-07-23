import type { ExplorationId } from "metabase-types/api";

// Per-exploration sidebar state. Persisted to localStorage for now so it
// doesn't require a backend change; keyed per exploration.

const SORT_ORDER_KEY = "metabase-explorations-sort-order";
const READ_PAGES_KEY = "metabase-explorations-read-pages";

// How the sidebar tree is ordered. "interestingness" ranks pages by their
// interestingness score (the default); "alphabetical" sorts by name.
export type ExplorationSortOrder = "interestingness" | "alphabetical";

export const DEFAULT_SORT_ORDER: ExplorationSortOrder = "interestingness";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    // localStorage JSON is untyped, so have to type it
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore write failures (e.g. storage disabled / quota exceeded).
  }
}

export function getExplorationSortOrder(
  explorationId: ExplorationId,
): ExplorationSortOrder {
  const all = read<Record<string, ExplorationSortOrder>>(SORT_ORDER_KEY, {});
  return all[String(explorationId)] ?? DEFAULT_SORT_ORDER;
}

export function setExplorationSortOrder(
  explorationId: ExplorationId,
  sortOrder: ExplorationSortOrder,
): void {
  const all = read<Record<string, ExplorationSortOrder>>(SORT_ORDER_KEY, {});
  all[String(explorationId)] = sortOrder;
  write(SORT_ORDER_KEY, all);
}

export function getReadExplorationPageIds(
  explorationId: ExplorationId,
): Set<string> {
  const all = read<Record<string, string[]>>(READ_PAGES_KEY, {});
  return new Set(all[String(explorationId)] ?? []);
}

const MAX_TRACKED_EXPLORATIONS = 15;

function pruneOldestExplorations<T>(all: Record<string, T>): Record<string, T> {
  const keys = Object.keys(all);
  if (keys.length <= MAX_TRACKED_EXPLORATIONS) {
    return all;
  }
  // Exploration ids are serial, so the smallest ids are the oldest ones.
  const keep = new Set(
    keys
      .map(Number)
      .sort((a, b) => b - a)
      .slice(0, MAX_TRACKED_EXPLORATIONS)
      .map(String),
  );
  return Object.fromEntries(
    Object.entries(all).filter(([key]) => keep.has(key)),
  );
}

export function setExplorationPageRead(
  explorationId: ExplorationId,
  pageId: string | number,
): void {
  const all = read<Record<string, string[]>>(READ_PAGES_KEY, {});
  const key = String(explorationId);
  const current = new Set(all[key] ?? []);
  current.add(String(pageId));
  all[key] = Array.from(current);
  write(READ_PAGES_KEY, pruneOldestExplorations(all));
}
