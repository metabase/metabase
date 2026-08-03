import { DashboardClickAction } from "metabase/dashboard/click-behavior/DashboardClickAction";
import type { QueryClickActionsMode } from "metabase/visualizations/types";

import { PublicMode } from "./PublicMode";

export const PublicDashboardMode: QueryClickActionsMode = {
  ...PublicMode,
  clickActions: [DashboardClickAction],
};
