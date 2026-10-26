import { Mode } from "metabase/querying/click-actions/Mode";
import type { QueryClickActionsMode } from "metabase/querying/click-actions/types";

/**
 * The real click-actions pipeline, limited to the drills that write a filter
 * clause. Pivot ("Break out by…") counts: it writes one `=` per breakout
 * value before swapping the breakout. Object detail, sort and the rest would
 * only distract from the question the prototype asks: what does a drilled
 * filter look like next to an OR expression?
 */
const FILTER_DRILLS_MODE: QueryClickActionsMode = {
  name: "or-filters-prototype",
  hasDrills: true,
  availableOnlyDrills: [
    "drill-thru/quick-filter",
    "drill-thru/fk-filter",
    "drill-thru/column-filter",
    "drill-thru/underlying-records",
    "drill-thru/zoom-in.timeseries",
    "drill-thru/zoom-in.binning",
    "drill-thru/zoom-in.geographic",
    "drill-thru/pivot",
  ],
  clickActions: [],
};

export const FILTER_DRILLS_CLICK_MODE = new Mode(() => FILTER_DRILLS_MODE);
