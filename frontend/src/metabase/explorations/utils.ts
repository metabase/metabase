import type { DatasetQuery, ExplorationQuery } from "metabase-types/api";

export function shouldIgnoreKeyboardEvent(event: KeyboardEvent) {
  if (!(event.target instanceof HTMLElement)) {
    return true;
  }

  const isBodyFocused = event.target === document.body;
  const isWithinExplorationPage = !!event.target.closest(
    "[data-test-id='exploration-page']",
  );

  // ignore keyboard events that are not on the exploration page
  // unless they're on the body. on initial load, the body is focused - we want to allow keyboard events in that case
  if (!isBodyFocused && !isWithinExplorationPage) {
    return true;
  }

  // ignore keyboard events on interactive elements
  return !!event.target.closest(
    "input, textarea, select, [contenteditable=true]",
  );
}

export function getAdjacentById<T extends { id: unknown }>(
  items: T[],
  currentId: T["id"] | null | undefined,
  direction: 1 | -1,
): T | null | undefined {
  if (items.length === 0) {
    return null;
  }
  const currentIndex = items.findIndex((item) => item.id === currentId);
  const nextIndex = (currentIndex + direction + items.length) % items.length;
  return items[nextIndex];
}

/**
 * Metadata is used for chart type selection
 * All queries in a group share metadata, so using any dataset query is correct
 */
export function getGroupDatasetQueryForMetadata(
  groupQueries: ExplorationQuery[],
): DatasetQuery {
  return groupQueries[0].dataset_query;
}
