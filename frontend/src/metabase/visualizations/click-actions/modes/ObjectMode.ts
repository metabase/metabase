import type { QueryClickActionsMode } from "../../types";
import { ObjectDetailDrill } from "../drills/ObjectDetailDrill";

export const ObjectMode: QueryClickActionsMode = {
  name: "object",
  clickActions: [ObjectDetailDrill],
};
