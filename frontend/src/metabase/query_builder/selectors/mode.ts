import { createSelector } from "@reduxjs/toolkit";

import { getMode as getQuestionMode } from "metabase/querying/click-actions/lib/modes";
import type { State } from "metabase/redux/store";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";

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

export const getMode = createSelector([getLastRunQuestion], (question) =>
  question ? getQuestionMode(question) : null,
);

export const getIsObjectDetail = createSelector(
  [getMode, isZoomingRow],
  (mode, isZoomingSingleRow) => isZoomingSingleRow || mode?.name() === "object",
);
