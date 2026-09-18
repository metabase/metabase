import type { ExplorationId } from "metabase-types/api";

export const EXPLORATION_BASE_PATH = "question/research";

export function newExploration(): string {
  return `/${EXPLORATION_BASE_PATH}`;
}

export function newExplorationPlan(): string {
  return `/${EXPLORATION_BASE_PATH}/plan`;
}

export function exploration(explorationId: ExplorationId): string {
  return `/${EXPLORATION_BASE_PATH}/${explorationId}`;
}

export function explorationPage(
  explorationId: ExplorationId,
  pageId: string | number,
): string {
  return `${exploration(explorationId)}/page/${encodeURIComponent(String(pageId))}`;
}

export function explorationSummary(explorationId: ExplorationId): string {
  return `${exploration(explorationId)}/summary`;
}

export function isExplorationUrl(pathname: string): boolean {
  return pathname.startsWith(`/${EXPLORATION_BASE_PATH}/`);
}

/**
 * Merges the current exploration search params onto a destination path.
 * When the comments panel is open and the destination is a page, retargets
 * `comments` to that page id — same behavior as sidebar page selection.
 */
export function explorationPathWithSearch(
  pathname: string,
  locationSearch: string,
): string {
  const path = pathname.split("?")[0] ?? pathname;
  const search = new URLSearchParams(locationSearch);

  const pagePrefix = "/page/";
  const pageIdx = path.lastIndexOf(pagePrefix);
  if (pageIdx !== -1 && search.has("comments")) {
    const pageId = decodeURIComponent(path.slice(pageIdx + pagePrefix.length));
    if (pageId) {
      search.set("comments", pageId);
    }
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
