import { Mode } from "metabase/querying/click-actions/Mode";
import type { QueryClickActionsMode } from "metabase/querying/click-actions/types";

/**
 * The real click-actions pipeline with every drill the query offers, the same
 * set the query builder shows.
 */
const ALL_DRILLS_MODE: QueryClickActionsMode = {
  name: "clickable-charts-prototype",
  hasDrills: true,
  clickActions: [],
};

export const ALL_DRILLS_CLICK_MODE = new Mode(() => ALL_DRILLS_MODE);
