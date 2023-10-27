import { ObjectDetailDrill } from "metabase/visualizations/click-actions/drills/ObjectDetailDrill";
import type { QueryClickActionsMode } from "../../types";

export const ObjectMode: QueryClickActionsMode = {
  name: "object",
  clickActions: [ObjectDetailDrill],
};
