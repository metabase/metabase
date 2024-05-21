import type { Location } from "history";

import type { DashboardDisplayOptionControls } from "metabase/dashboard/hoc/controls/types";
import type { DashboardId } from "metabase-types/api";

export type DashboardControlsProps = {
  location: Location;
  dashboardId: DashboardId;
};

export type DashboardControlsPassedProps = DashboardDisplayOptionControls &
  DashboardControlsProps & {
    queryParams: Record<string, string | string[] | null | undefined>;
  };
