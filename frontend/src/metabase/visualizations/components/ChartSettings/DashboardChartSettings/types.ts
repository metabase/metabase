import type { Dashboard, DashboardCard, Widget } from "metabase-types/api";

import type { CommonChartSettingsProps } from "../types";

export type DashboardChartSettingsProps = {
  className?: string;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  isDashboard?: boolean;
  widgets?: Widget[];
  onClose?: () => void;
} & CommonChartSettingsProps;
