/* @flow */

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

import SummarizeBySegmentMetricAction from "../actions/SummarizeBySegmentMetricAction";
import CommonMetricsAction from "../actions/CommonMetricsAction";
import CountByTimeAction from "../actions/CountByTimeAction";
import SummarizeColumnDrill from "../drill/SummarizeColumnDrill";
import SummarizeColumnByTimeDrill from "../drill/SummarizeColumnByTimeDrill";
import CountByColumnDrill from "../drill/CountByColumnDrill";
// import PlotSegmentField from "../actions/PlotSegmentField";

import type { QueryMode } from "metabase/meta/types/Visualization";

const SegmentMode: QueryMode = {
  name: "segment",
  actions: [
    ...DEFAULT_ACTIONS,
    CommonMetricsAction,
    CountByTimeAction,
    SummarizeBySegmentMetricAction,
    // commenting this out until we sort out viz settings in QB2
    // PlotSegmentField
  ],
  drills: [
    ...DEFAULT_DRILLS,
    SummarizeColumnDrill,
    SummarizeColumnByTimeDrill,
    CountByColumnDrill,
  ],
};

export default SegmentMode;
