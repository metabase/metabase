import type { QueryMode } from "metabase/visualizations/types";
import { PivotDrill } from "../drills/PivotDrill";
import { DefaultMode } from "./DefaultMode";

export const PivotMode: QueryMode = {
  name: "pivot",
  drills: [...DefaultMode.drills, PivotDrill],
};
