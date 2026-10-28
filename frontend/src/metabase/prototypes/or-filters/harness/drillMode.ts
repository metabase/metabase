import { Mode } from "metabase/querying/click-actions/Mode";
import type { QueryClickActionsMode } from "metabase/querying/click-actions/types";

/**
 * The real click-actions pipeline with every drill the query offers, the same
 * set the query builder shows. Cell clicks lead with the filter-writing
 * drills; headers add distribution, summarize, sort, extract and combine.
 */
const ALL_DRILLS_MODE: QueryClickActionsMode = {
  name: "or-filters-prototype",
  hasDrills: true,
  clickActions: [],
};

export const ALL_DRILLS_CLICK_MODE = new Mode(() => ALL_DRILLS_MODE);
