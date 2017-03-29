/* @flow weak */

import React from "react";

import QueryBuilderSidebarSection from "../sidebar/QueryBuilderSidebarSection";

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

import SummarizeBySegmentMetricAction
    from "../actions/SummarizeBySegmentMetricAction";
import PlotSegmentField from "../actions/PlotSegmentField";

export default {
    name: "segment",

    getMainSections() {
        return [SegmentMainView];
    },

    getActions() {
        return DEFAULT_ACTIONS.concat([
            SummarizeBySegmentMetricAction
            // commenting this out until we sort out viz settings in QB2
            // PlotSegmentField
        ]);
    },

    getDrills() {
        return DEFAULT_DRILLS;
    }
};

const SegmentMainView = props => (
    <QueryBuilderSidebarSection {...props} features={{ filter: true }} />
);
