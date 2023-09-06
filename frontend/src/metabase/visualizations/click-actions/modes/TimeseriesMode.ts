import { getPivotDrill } from "metabase/visualizations/click-actions/drills/PivotDrill";
import type { QueryClickActionsMode } from "../../types";
import { TimeseriesModeFooter } from "../components/TimeseriesModeFooter";
import { DefaultMode } from "./DefaultMode";

export const TimeseriesMode: QueryClickActionsMode = {
  name: "timeseries",
  clickActions: [
    ...DefaultMode.clickActions,
    getPivotDrill({ withTime: false }),
  ],
  ModeFooter: TimeseriesModeFooter,
};
