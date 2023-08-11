import type { QueryMode } from "../types";
import { ObjectDetailDrill } from "../drills/ObjectDetailDrill";

export const ObjectMode: QueryMode = {
  name: "object",
  drills: [ObjectDetailDrill],
};
