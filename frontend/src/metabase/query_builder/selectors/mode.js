import { createSelector } from "@reduxjs/toolkit";

import { getMode as getQuestionMode } from "metabase/visualizations/click-actions/lib/modes";

import { getQuestion } from "../selectors";

const getZoomedObjectId = (state) => state.qb.zoomedRowObjectId;

const isZoomingRow = createSelector(
  [getZoomedObjectId],
  (index) => index != null,
);

export const getMode = createSelector(
  [getQuestion],
  (question) => question && getQuestionMode(question),
);

export const getIsObjectDetail = createSelector(
  [getMode, isZoomingRow],
  (mode, isZoomingSingleRow) => isZoomingSingleRow || mode?.name() === "object",
);
