/* @flow */

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

import SummarizeBySegmentMetricAction
    from "../actions/SummarizeBySegmentMetricAction";
// import PlotSegmentField from "../actions/PlotSegmentField";

import type { QueryMode } from "metabase/meta/types/Visualization";

const SegmentMode: QueryMode = {
    name: "segment",
    actions: [
        ...DEFAULT_ACTIONS,
        SummarizeBySegmentMetricAction
        // commenting this out until we sort out viz settings in QB2
        // PlotSegmentField
    ],
    drills: [...DEFAULT_DRILLS]
};

export default SegmentMode;
