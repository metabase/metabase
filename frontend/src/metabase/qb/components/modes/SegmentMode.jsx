/* @flow */

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

import SummarizeBySegmentMetricAction
    from "../actions/SummarizeBySegmentMetricAction";
import SummarizeColumnDrill from "../drill/SummarizeColumnDrill";
import SumColumnByTimeDrill from "../drill/SumColumnByTimeDrill";
import CountByColumnDrill from "../drill/CountByColumnDrill";
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
    drills: [
        ...DEFAULT_DRILLS,
        SummarizeColumnDrill,
        SumColumnByTimeDrill,
        CountByColumnDrill
    ]
};

export default SegmentMode;
