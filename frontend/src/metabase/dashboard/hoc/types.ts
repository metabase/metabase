import type { Location } from "history";

import type { DashboardDisplayOptionControls } from "metabase/dashboard/hoc/controls/use-dashboard-display-options";
import type { DashboardId } from "metabase-types/api";

// passed via ...this.props
export type DashboardControlsProps = {
  location: Location;
  queryParams: Record<string, string | string[] | null | undefined>;
  dashboardId: DashboardId;
};

export type DashboardControlsPassedProps = DashboardDisplayOptionControls &
  DashboardControlsProps & { loadDashboardParams: () => void };
