import { createSelector } from "@reduxjs/toolkit";

import {
  selectQuestionFromCardBuilder,
  selectQuestionFromOptsBuilder,
} from "metabase/metadata-store";
import type { State } from "metabase/redux/store";
import type { DatabaseId, WritebackQueryAction } from "metabase-types/api";

import { convertActionToQuestionCard } from "./utils";

/**
 * The question the action editor starts from: the action's own query, or an
 * empty native query when there is no action yet.
 */
export const getActionQuestion = createSelector(
  [
    selectQuestionFromCardBuilder,
    selectQuestionFromOptsBuilder,
    (_state: State, action: WritebackQueryAction | undefined) => action,
    (_state: State, _action, databaseId: DatabaseId | undefined) => databaseId,
  ],
  (buildQuestionFromCard, buildDraftQuestion, action, databaseId) => {
    if (!action) {
      return buildDraftQuestion({
        DEPRECATED_RAW_MBQL_type: "native",
        DEPRECATED_RAW_MBQL_databaseId: databaseId,
      });
    }

    return buildQuestionFromCard(
      convertActionToQuestionCard(action),
    ).setParameters(action.parameters);
  },
);
