import { createSelector } from "@reduxjs/toolkit";

import { isSavedQuestionChanged } from "metabase/querying/common/utils/question";
import type { State } from "metabase/redux/store";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";

/**
 * The question on screen, and the slice reads it is built from.
 *
 * Separate from `query_builder/selectors` because the app shell reads these on
 * every page, and that module reaches the visualization and querying stacks. Its
 * dependencies here are only metabase-lib and the metadata selector, so an
 * always-mounted component can import it without pulling the query builder into
 * the initial bundle. `query_builder/selectors` re-exports all of it.
 */

// This selector can be called from public questions / dashboards, which do not have state.qb
export const getUiControls = (state: State) => state.qb?.uiControls;

export const getCard = (state: State) => state.qb.card;
export const getOriginalCard = (state: State) => state.qb.originalCard;
export const getParameterValues = (state: State) => state.qb.parameterValues;

export const getQueryBuilderMode = createSelector(
  [getUiControls],
  (uiControls) => uiControls.queryBuilderMode,
);

export const getOriginalQuestion = createSelector(
  [getMetadata, getOriginalCard],
  (metadata, card) =>
    (metadata && card && new Question(card, metadata)) ?? undefined,
);

export const getQuestionWithoutComposing = createSelector(
  [getCard, getMetadata, getParameterValues],
  (card, metadata, parameterValues) => {
    if (!card || !metadata) {
      return;
    }
    return new Question(card, metadata, parameterValues);
  },
);

export const getQuestion = createSelector(
  [getQuestionWithoutComposing, getQueryBuilderMode],
  (question, queryBuilderMode) => {
    if (!question) {
      return;
    }

    const isModel = question.type() === "model";
    const isMetric = question.type() === "metric";
    if ((isModel || isMetric) && queryBuilderMode === "dataset") {
      return isModel ? question.lockDisplay() : question;
    }

    // When opening a model or a metric, we construct a question
    // with a clean, ad-hoc, query.
    // This has to be skipped for users without data permissions.
    // See https://github.com/metabase/metabase/issues/20042
    const composedQuestion =
      isModel || isMetric ? question.composeQuestion() : question;
    const { isEditable } = Lib.queryDisplayInfo(composedQuestion.query());
    return isEditable ? composedQuestion : question;
  },
);

export const getIsSavedQuestionChanged = createSelector(
  [getQuestion, getOriginalQuestion],
  isSavedQuestionChanged,
);
