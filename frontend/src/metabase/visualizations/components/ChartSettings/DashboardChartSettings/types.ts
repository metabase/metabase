import type {
  Dashboard,
  DashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import type {
  BaseChartSettingsTestProps,
  CommonChartSettingsProps,
} from "../types";

export type DashboardChartSettingsProps = {
  className?: string;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  isDashboard?: boolean;
  onClose?: () => void;
} & CommonChartSettingsProps &
  DashboardChartSettingsTestProps;

export type DashboardChartSettingsTestProps = BaseChartSettingsTestProps & {
  settings?: VisualizationSettings;
};
