import { getPivotDrill } from "metabase/visualizations/click-actions/drills/PivotDrill";
import type { QueryClickActionsMode } from "../../types";
import { DefaultMode } from "./DefaultMode";

export const PivotMode: QueryClickActionsMode = {
  name: "pivot",
  clickActions: [
    ...(DefaultMode.clickActions || []),
    getPivotDrill({ withLocation: false }),
  ],
};
