import type Question from "metabase-lib/v1/Question";
import type {
  Dashboard,
  DashboardCard,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

import type { ChartSettingsFooterProps } from "../ChartSettingsFooter";

export type ChartSettingsVisualizationProps = {
  rawSeries: RawSeries;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  onUpdateVisualizationSettings: (
    changedSettings: VisualizationSettings,
    question: Question,
  ) => void;
} & ChartSettingsFooterProps;
