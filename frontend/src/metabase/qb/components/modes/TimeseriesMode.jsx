/* @flow weak */

import React, { Component, PropTypes } from "react";

import TimeseriesGroupingWidget
    from "metabase/qb/components/TimeseriesGroupingWidget";
import TimeseriesFilterWidget
    from "metabase/qb/components/TimeseriesFilterWidget";

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

import PivotByCategoryAction from "../actions/PivotByCategoryAction";
import PivotByLocationAction from "../actions/PivotByLocationAction";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByLocationDrill from "../drill/PivotByLocationDrill";

import TimeseriesFilterDrill from "../drill/TimeseriesFilterDrill";

export const ModeFooter = props => {
    return (
        <div className="flex layout-centered">
            <TimeseriesFilterWidget {...props} className="mr1" />
            <TimeseriesGroupingWidget {...props} className="mr1" />
        </div>
    );
};

export default {
    name: "timeseries",

    ModeFooter,

    getActions() {
        return DEFAULT_ACTIONS.concat([
            PivotByCategoryAction,
            PivotByLocationAction
        ]);
    },

    getDrills() {
        return DEFAULT_DRILLS.concat([
            TimeseriesFilterDrill,
            PivotByCategoryDrill,
            PivotByLocationDrill
        ]);
    }
};
