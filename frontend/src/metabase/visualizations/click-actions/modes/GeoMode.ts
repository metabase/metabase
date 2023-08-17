import type { QueryMode } from "metabase/visualizations/types";
import { getPivotDrill } from "../drills/PivotDrill";
import { DefaultMode } from "./DefaultMode";

export const GeoMode: QueryMode = {
  name: "geo",
  drills: [...DefaultMode.drills, getPivotDrill({ withLocation: false })],
};
