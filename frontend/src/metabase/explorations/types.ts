import type {
  CollectionId,
  DocumentContent,
  ExplorationPageNodeId,
} from "metabase-types/api";

export interface ExplorationCollection {
  id?: CollectionId;
  name: string;
}

export const EXPLORATION_SIDEBAR_TABS = [
  "all",
  "stars",
  "discussions",
] as const;

export type ExplorationSidebarTab = (typeof EXPLORATION_SIDEBAR_TABS)[number];

export function isExplorationSidebarTab(
  tab: string | undefined,
): tab is ExplorationSidebarTab {
  return Boolean(tab && EXPLORATION_SIDEBAR_TABS.some((t) => t === tab));
}

export type CommentDrafts = Record<ExplorationPageNodeId, DocumentContent>;
