import { createSelector } from "@reduxjs/toolkit";

import { timelineApi } from "metabase/api";
import type { Timeline } from "metabase-types/api";

import { transformTimelines } from "./utils";

const NO_TIMELINES: Timeline[] = [];

const selectListTimelines = timelineApi.endpoints.listTimelines.select({
  include: "events",
});

export const getFetchedTimelines = createSelector(
  [selectListTimelines],
  (result): Timeline[] => result.data ?? NO_TIMELINES,
);

export const getTransformedTimelines = createSelector(
  [getFetchedTimelines],
  transformTimelines,
);
