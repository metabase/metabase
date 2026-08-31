import { createSelector } from "@reduxjs/toolkit";

import { getMetadata } from "metabase/metadata-store";
import { getMode as getQuestionMode } from "metabase/visualizations/click-actions/lib/modes";
import Question from "metabase-lib/v1/Question";

import type { QueryBuilderStoreState } from "./state";

const getLastRunCard = (state: QueryBuilderStoreState) => state.qb.lastRunCard;
const getParameterValues = (state: QueryBuilderStoreState) =>
  state.qb.parameterValues;
const getZoomedObjectId = (state: QueryBuilderStoreState) =>
  state.qb.zoomedRowObjectId;

const getLastRunQuestion = createSelector(
  [getMetadata, getLastRunCard, getParameterValues],
  (metadata, card, parameterValues) =>
    card && metadata && new Question(card, metadata, parameterValues),
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
