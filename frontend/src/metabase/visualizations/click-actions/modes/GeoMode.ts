import type { QueryClickActionsMode } from "../../types";
import { getPivotDrill } from "../drills/PivotDrill";
import { DefaultMode } from "./DefaultMode";

export const GeoMode: QueryClickActionsMode = {
  name: "geo",
  clickActions: [
    ...DefaultMode.clickActions,
    getPivotDrill({ withLocation: false }),
  ],
};
