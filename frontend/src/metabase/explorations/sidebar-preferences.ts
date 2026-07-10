import type { ExplorationId } from "metabase-types/api";

// Sidebar preferences the user sets from the filter menu. Persisted to
// localStorage for now so they don't require a backend change; keyed per
// exploration.

const SORT_ORDER_KEY = "metabase-explorations-sort-order";

// How the sidebar tree is ordered. "interestingness" ranks pages by their
// interestingness score (the default); "alphabetical" sorts by name.
export type ExplorationSortOrder = "interestingness" | "alphabetical";

export const DEFAULT_SORT_ORDER: ExplorationSortOrder = "interestingness";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
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
