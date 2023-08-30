import type { QueryClickActionsMode } from "../../types";
import { PivotDrill } from "../drills/PivotDrill";
import { DefaultMode } from "./DefaultMode";

export const MetricMode: QueryClickActionsMode = {
  name: "metric",
  clickActions: [...DefaultMode.clickActions, PivotDrill],
};
