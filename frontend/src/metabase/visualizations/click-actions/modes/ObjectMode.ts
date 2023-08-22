import type { QueryMode } from "metabase/visualizations/types";
import { ObjectDetailDrill } from "../drills/ObjectDetailDrill";

export const ObjectMode: QueryMode = {
  name: "object",
  drills: [ObjectDetailDrill],
};
