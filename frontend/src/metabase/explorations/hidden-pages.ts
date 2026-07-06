import type { ExplorationId } from "metabase-types/api";

// Pages the user has hidden while triaging. Persisted to localStorage for now
// so hiding doesn't require a backend change; keyed per exploration.
const STORAGE_KEY = "metabase-explorations-hidden-pages";

type HiddenPagesByExploration = Record<string, string[]>;

function readAll(): HiddenPagesByExploration {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(value: HiddenPagesByExploration): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore write failures (e.g. storage disabled / quota exceeded).
  }
}

export function getHiddenExplorationPageIds(
  explorationId: ExplorationId,
): Set<string> {
  return new Set(readAll()[String(explorationId)] ?? []);
}

export function setExplorationPageHidden(
  explorationId: ExplorationId,
  pageId: string | number,
  hidden: boolean,
): void {
  const all = readAll();
  const key = String(explorationId);
  const current = new Set(all[key] ?? []);

  if (hidden) {
    current.add(String(pageId));
  } else {
    current.delete(String(pageId));
  }

  all[key] = Array.from(current);
  writeAll(all);
}
