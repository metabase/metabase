import type { Dashboard, DashboardCard } from "metabase-types/api";
import type { CommonChartSettingsProps } from "metabase/visualizations/components/ChartSettings/types";

export type DashboardChartSettingsProps = {
  className?: string;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  isDashboard?: boolean;
  onClose?: () => void;
} & CommonChartSettingsProps;
