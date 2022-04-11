/* eslint-disable react/prop-types */
import React from "react";

// import TimeseriesGroupingWidget
//     from "metabase/modes/components/TimeseriesGroupingWidget";
import TimeseriesFilterWidget from "metabase/modes/components/TimeseriesFilterWidget";

import { getDefaultDrills } from "../drill";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByLocationDrill from "../drill/PivotByLocationDrill";

import TimeseriesGroupingWidget from "metabase/modes/components/TimeseriesGroupingWidget";

export const TimeseriesModeFooter = props => {
  return (
    <div className="flex layout-centered">
      <span className="mr1">View</span>
      <TimeseriesFilterWidget {...props} card={props.lastRunCard} />
      <span className="mx1">by</span>
      <TimeseriesGroupingWidget {...props} card={props.lastRunCard} />
    </div>
  );
};

const TimeseriesMode = {
  name: "timeseries",
  drills: () => [
    PivotByCategoryDrill,
    PivotByLocationDrill,
    ...getDefaultDrills(),
  ],
  ModeFooter: TimeseriesModeFooter,
};

export default TimeseriesMode;
