/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import TimeseriesFilterWidget from "metabase/modes/components/TimeseriesFilterWidget";
import TimeseriesGroupingWidget from "metabase/modes/components/TimeseriesGroupingWidget";
import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByLocationDrill from "../drill/PivotByLocationDrill";
import DefaultMode from "./DefaultMode";

const TimeseriesModeFooter = props => {
  const onChange = question => {
    const { updateQuestion } = props;
    updateQuestion(question, { run: true });
  };

  return (
    <div className="flex layout-centered">
      <span className="mr1">{t`View`}</span>
      <TimeseriesFilterWidget {...props} card={props.lastRunCard} />
      <span className="mx1">{t`by`}</span>
      <TimeseriesGroupingWidget
        {...props}
        onChange={onChange}
        card={props.lastRunCard}
      />
    </div>
  );
};

const TimeseriesMode = {
  name: "timeseries",
  drills: [PivotByCategoryDrill, PivotByLocationDrill, ...DefaultMode.drills],
  ModeFooter: TimeseriesModeFooter,
};

export default TimeseriesMode;
