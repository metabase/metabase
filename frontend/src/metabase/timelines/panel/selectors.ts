import { createSelector } from "@reduxjs/toolkit";

import { timelineApi } from "metabase/api";
import type { ListTimelinesRequest, Timeline } from "metabase-types/api";

import { transformTimelines } from "./utils";

const NO_TIMELINES: Timeline[] = [];

export const LIST_TIMELINES_REQUEST: ListTimelinesRequest = {
  include: "events",
};

export const selectListTimelines = timelineApi.endpoints.listTimelines.select(
  LIST_TIMELINES_REQUEST,
);

export const getFetchedTimelines = createSelector(
  [selectListTimelines],
  (result): Timeline[] => result.data ?? NO_TIMELINES,
);

export const getTransformedTimelines = createSelector(
  [getFetchedTimelines],
  transformTimelines,
);
