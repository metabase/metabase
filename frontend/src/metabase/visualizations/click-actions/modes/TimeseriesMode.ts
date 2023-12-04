import { TimeseriesChrome } from "metabase/common/components/TimeseriesChrome";
import { getPivotDrill } from "metabase/visualizations/click-actions/drills/PivotDrill";
import type { QueryClickActionsMode } from "../../types";
import { DefaultMode } from "./DefaultMode";

export const TimeseriesMode: QueryClickActionsMode = {
  name: "timeseries",
  clickActions: [
    getPivotDrill({ withTime: false }),
    ...DefaultMode.clickActions,
  ],
  ModeFooter: TimeseriesChrome,
};
