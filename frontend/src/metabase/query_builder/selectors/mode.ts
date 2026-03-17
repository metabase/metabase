import { createSelector } from "@reduxjs/toolkit";

import { getMetadata } from "metabase/selectors/metadata";
import { getMode as getQuestionMode } from "metabase/visualizations/click-actions/lib/modes";
import Question from "metabase-lib/v1/Question";
import type { State } from "metabase-types/store";

const getLastRunCard = (state: State) => state.qb.lastRunCard;
const getParameterValues = (state: State) => state.qb.parameterValues;
const getZoomedObjectId = (state: State) => state.qb.zoomedRowObjectId;

const getLastRunQuestion = createSelector(
  [getMetadata, getLastRunCard, getParameterValues],
  (metadata, card, parameterValues) =>
    card && metadata && new Question(card, metadata, parameterValues),
);

const isZoomingRow = createSelector(
  [getZoomedObjectId],
  (index) => index != null,
);

export const getMode = createSelector(
  [getLastRunQuestion],
  (question) => question && getQuestionMode(question),
);

export const getIsObjectDetail = createSelector(
  [getMode, isZoomingRow],
  (mode, isZoomingSingleRow) => isZoomingSingleRow || mode?.name() === "object",
);
