import { DashboardClickAction } from "metabase/visualizations/click-actions/actions/DashboardClickAction";
import type { QueryClickActionsMode } from "metabase/visualizations/types";

export const EmbeddingSdkStaticMode: QueryClickActionsMode = {
  name: "embedding-sdk-static",
  hasDrills: false,
  clickActions: [DashboardClickAction],
};
