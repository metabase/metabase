import { getPivotDrill } from "metabase/visualizations/click-actions/drills/PivotDrill";
import type { QueryClickActionsMode } from "../../types";
import { DefaultMode } from "./DefaultMode";

export const GeoMode: QueryClickActionsMode = {
  name: "geo",
  clickActions: [
    ...(DefaultMode.clickActions || []),
    getPivotDrill({ withLocation: false }),
  ],
};
