import type { HighlightedObject } from "metabase/viz-core";
import type { Exploration, ExplorationQueryId } from "metabase-types/api";

export interface HighlightedCommentState {
  childTargetId: string;
  highlighted: HighlightedObject;
  explorationQueryIds: ExplorationQueryId[];
}

export interface ExplorationsState {
  currentExploration?: Exploration;
  highlightedComment: HighlightedCommentState | null;
}
