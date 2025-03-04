import type { StackProps } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type {
  Dashboard,
  DashboardCard,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

import type { ChartSettingsFooterProps } from "../ChartSettingsFooter";

export type ChartSettingsVisualizationProps = Omit<StackProps, "onReset"> & {
  rawSeries: RawSeries;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  onUpdateVisualizationSettings: (
    changedSettings: VisualizationSettings,
    question?: Question,
  ) => void;
} & ChartSettingsFooterProps;
