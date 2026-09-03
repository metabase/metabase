import { createSelector } from "@reduxjs/toolkit";

import { selectQuestionFromCardBuilder } from "metabase/metadata-store";
import { getMode as getQuestionMode } from "metabase/visualizations/click-actions/lib/modes";

import type { QueryBuilderStoreState } from "./state";

const getLastRunCard = (state: QueryBuilderStoreState) => state.qb.lastRunCard;
const getParameterValues = (state: QueryBuilderStoreState) =>
  state.qb.parameterValues;
const getZoomedObjectId = (state: QueryBuilderStoreState) =>
  state.qb.zoomedRowObjectId;

// Typed against this store's state so every input below takes the same
// argument. A wider `State` makes reselect merge the parameter lists into a
// signature that needs two arguments.
const getQuestionBuilder = (state: QueryBuilderStoreState) =>
  selectQuestionFromCardBuilder(state);

const getLastRunQuestion = createSelector(
  [getQuestionBuilder, getLastRunCard, getParameterValues],
  (buildQuestion, card, parameterValues) =>
    card && buildQuestion(card, parameterValues),
);

const isZoomingRow = createSelector(
  [getZoomedObjectId],
  (index) => index != null,
);

export const getMode = createSelector([getLastRunQuestion], (question) =>
  question ? getQuestionMode(question) : null,
);

export const getIsObjectDetail = createSelector(
  [getMode, isZoomingRow],
  (mode, isZoomingSingleRow) => isZoomingSingleRow || mode?.name() === "object",
);
