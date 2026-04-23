import type { CommonChartSettingsProps } from "metabase/visualizations/components/ChartSettings/types";
import type { Dashboard, DashboardCard } from "metabase-types/api";

export type DashboardChartSettingsProps = {
  className?: string;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  isDashboard?: boolean;
  onClose?: () => void;
} & CommonChartSettingsProps;
