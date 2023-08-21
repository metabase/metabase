import type { QueryMode } from "metabase/visualizations/types";
import { getPivotDrill } from "../drills/PivotDrill";
import { TimeseriesModeFooter } from "../components/TimeseriesModeFooter";
import { DefaultMode } from "./DefaultMode";

export const TimeseriesMode: QueryMode = {
  name: "timeseries",
  drills: [getPivotDrill({ withTime: false }), ...DefaultMode.drills],
  ModeFooter: TimeseriesModeFooter,
};
