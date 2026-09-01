import { useLocation } from "metabase/router";
import * as Urls from "metabase/urls";

export type ExplorationCommentView = "page" | "summary";

interface UseExplorationCommentUrlOptions {
  childTargetId?: string | null;
  view: ExplorationCommentView;
}

function parseExplorationId(pathname: string): number | null {
  const prefix = `/${Urls.EXPLORATION_BASE_PATH}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const idSegment = pathname.slice(prefix.length).split("/")[0];
  const id = Number(idSegment);
  return Number.isFinite(id) ? id : null;
}

/**
 * Builds an exploration comments deep-link: `?comments=<childTargetId>` plus
 * a pinned pathname so the main pane matches the comment's target. Without
 * the pin, bare exploration URLs re-derive selection via auto-tracking and
 * copied links can open the wrong page.
 */
export function useExplorationCommentUrl({
  childTargetId,
  view,
}: UseExplorationCommentUrlOptions): string {
  const { pathname, search: locationSearch } = useLocation();
  if (!pathname) {
    return "";
  }

  const explorationId = parseExplorationId(pathname);
  if (explorationId == null) {
    return "";
  }

  const search = new URLSearchParams(locationSearch);
  if (childTargetId) {
    search.set("comments", childTargetId);
  } else {
    search.delete("comments");
  }

  const pinnedPath =
    view === "summary"
      ? Urls.explorationSummary(explorationId)
      : childTargetId != null
        ? Urls.explorationPage(explorationId, childTargetId)
        : Urls.exploration(explorationId);

  const query = search.toString();
  return query ? `${pinnedPath}?${query}` : pinnedPath;
}
