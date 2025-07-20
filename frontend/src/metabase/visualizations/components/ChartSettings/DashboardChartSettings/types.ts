import type { Dashboard, DashboardCard } from "metabase-types/api";

import type { CommonChartSettingsProps, Widget } from "../types";

export type DashboardChartSettingsProps = {
  className?: string;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  isDashboard?: boolean;
  widgets?: Widget[];
  onClose?: () => void;
} & CommonChartSettingsProps;
