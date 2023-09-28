import { getPivotDrill } from "metabase/modes/components/drill/PivotDrill";
import { TimeseriesModeFooter } from "metabase/visualizations/click-actions/components/TimeseriesModeFooter";
import DefaultMode from "./DefaultMode";

const TimeseriesMode = {
  name: "timeseries",
  drills: [getPivotDrill({ withTime: false }), ...DefaultMode.drills],
  ModeFooter: TimeseriesModeFooter,
};

export default TimeseriesMode;
