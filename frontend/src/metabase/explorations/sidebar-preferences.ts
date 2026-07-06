import type { ExplorationId } from "metabase-types/api";

// Sidebar preferences the user sets from a group's "..." menu. Persisted to
// localStorage for now so they don't require a backend change; keyed per
// exploration.

const ARCHIVED_GROUPS_KEY = "metabase-explorations-archived-groups";
const SHOW_FILTERS_KEY = "metabase-explorations-show-filters";
const READ_PAGES_KEY = "metabase-explorations-read-pages";

export interface ExplorationShowFilters {
  unread: boolean;
  hidden: boolean;
  interesting: boolean;
}

export const DEFAULT_SHOW_FILTERS: ExplorationShowFilters = {
  unread: false,
  hidden: false,
  interesting: false,
};

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

export function getArchivedExplorationGroupIds(
  explorationId: ExplorationId,
): Set<string> {
  const all = read<Record<string, string[]>>(ARCHIVED_GROUPS_KEY, {});
  return new Set(all[String(explorationId)] ?? []);
}

export function setExplorationGroupArchived(
  explorationId: ExplorationId,
  groupId: string | number,
  archived: boolean,
): void {
  const all = read<Record<string, string[]>>(ARCHIVED_GROUPS_KEY, {});
  const key = String(explorationId);
  const current = new Set(all[key] ?? []);

  if (archived) {
    current.add(String(groupId));
  } else {
    current.delete(String(groupId));
  }

  all[key] = Array.from(current);
  write(ARCHIVED_GROUPS_KEY, all);
}

// A page is "read" once the user has viewed it; unread pages are bolded in the
// sidebar. Persisted per exploration.
export function getReadExplorationPageIds(
  explorationId: ExplorationId,
): Set<string> {
  const all = read<Record<string, string[]>>(READ_PAGES_KEY, {});
  return new Set(all[String(explorationId)] ?? []);
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
  write(READ_PAGES_KEY, all);
}

export function getExplorationShowFilters(
  explorationId: ExplorationId,
): ExplorationShowFilters {
  const all = read<Record<string, Partial<ExplorationShowFilters>>>(
    SHOW_FILTERS_KEY,
    {},
  );
  return { ...DEFAULT_SHOW_FILTERS, ...all[String(explorationId)] };
}

export function setExplorationShowFilters(
  explorationId: ExplorationId,
  filters: ExplorationShowFilters,
): void {
  const all = read<Record<string, ExplorationShowFilters>>(
    SHOW_FILTERS_KEY,
    {},
  );
  all[String(explorationId)] = filters;
  write(SHOW_FILTERS_KEY, all);
}
