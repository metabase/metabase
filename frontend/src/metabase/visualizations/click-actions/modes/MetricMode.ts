import type { QueryMode } from "metabase/visualizations/types";
import { PivotDrill } from "../drills/PivotDrill";
import { DefaultMode } from "./DefaultMode";

export const MetricMode: QueryMode = {
  name: "metric",
  drills: [...DefaultMode.drills, PivotDrill],
};
