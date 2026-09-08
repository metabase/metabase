import type { Exploration, ExplorationQueryId } from "metabase-types/api";
import type { HighlightedObject } from "metabase/viz-core";

export interface HighlightedCommentState {
  childTargetId: string;
  highlighted: HighlightedObject;
  explorationQueryIds: ExplorationQueryId[];
}

export interface ExplorationsState {
  currentExploration?: Exploration;
  highlightedComment: HighlightedCommentState | null;
}
