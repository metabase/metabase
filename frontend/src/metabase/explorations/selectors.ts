import { createSelector } from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";
import type { HighlightedCommentState } from "metabase/redux/store/explorations";
import type { ExplorationQuery, ExplorationQueryId } from "metabase-types/api";

export const getCurrentExploration = (state: State) =>
  state.explorations.currentExploration;

export const getHighlightedComment = (state: State) =>
  state.explorations.highlightedComment;

export function getHighlightedForChildTarget(
  state: State,
  childTargetId: string,
): HighlightedCommentState | null {
  const comment = state.explorations.highlightedComment;
  if (comment == null || comment.childTargetId !== childTargetId) {
    return null;
  }
  return comment;
}

const EMPTY_QUERIES_BY_ID: Readonly<
  Record<ExplorationQueryId, ExplorationQuery>
> = {};

export const getQueriesById = createSelector(
  [getCurrentExploration],
  (exploration): Readonly<Record<ExplorationQueryId, ExplorationQuery>> => {
    const threads = exploration?.threads ?? [];
    if (threads.length === 0) {
      return EMPTY_QUERIES_BY_ID;
    }
    const record: Record<ExplorationQueryId, ExplorationQuery> = {};
    for (const thread of threads) {
      for (const query of thread.queries ?? []) {
        record[query.id] = query;
      }
    }
    return record;
  },
);
