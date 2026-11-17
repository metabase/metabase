import { createSelector } from "@reduxjs/toolkit";

import type { QueryBuilderStoreState } from "./state";

const getZoomedObjectId = (state: QueryBuilderStoreState) =>
  state.qb.zoomedRowObjectId;

export const getIsObjectDetail = createSelector(
  [getZoomedObjectId],
  (index) => index != null,
);
