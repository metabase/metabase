import { DashboardClickAction } from "metabase/dashboard/click-behavior/DashboardClickAction";
import { Mode } from "metabase/querying/click-actions/Mode";
import type {
  ClickActionsMode,
  QueryClickActionsMode,
} from "metabase/visualizations/types";

import { PublicMode } from "./PublicMode";

export const PublicDashboardMode: QueryClickActionsMode = {
  ...PublicMode,
  clickActions: [DashboardClickAction],
};

export const publicDashboardClickActionMode: ClickActionsMode = new Mode(
  () => PublicDashboardMode,
);
