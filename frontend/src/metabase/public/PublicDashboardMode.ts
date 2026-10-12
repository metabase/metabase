import { DashboardClickAction } from "metabase/dashboard/click-behavior/DashboardClickAction";
import { Mode } from "metabase/querying/click-actions/Mode";
import type { QueryClickActionsMode } from "metabase/querying/click-actions/types";
import type { ClickActionsMode } from "metabase/visualizations/types";

import { PublicMode } from "./PublicMode";

const PublicDashboardMode: QueryClickActionsMode = {
  ...PublicMode,
  clickActions: [DashboardClickAction],
};

export const publicDashboardClickActionMode: ClickActionsMode = new Mode(
  () => PublicDashboardMode,
);
