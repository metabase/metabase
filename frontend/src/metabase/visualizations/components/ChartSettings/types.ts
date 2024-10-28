import type { ChartSettingsFooterProps } from "metabase/visualizations/components/ChartSettings/ChartSettingsFooter";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type {
  Dashboard,
  DashboardCard,
  RawSeries,
  Series,
  TransformedSeries,
  VisualizationSettings,
} from "metabase-types/api";

// this type is not full, we need to extend it later
export type Widget = {
  id: string;
  section: string;
  hidden?: boolean;
  props: Record<string, unknown>;
  title?: string;
  widget: (() => JSX.Element | null) | undefined;
};

type CommonChartSettingsProps = {
  series: Series;
  onChange?: (settings?: VisualizationSettings, question?: Question) => void;
};

export type DashboardChartSettingsProps = {
  className?: string;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  isDashboard?: boolean;
  onClose?: () => void;
  widgets?: Widget[];
} & CommonChartSettingsProps;

export type QuestionChartSettingsProps = {
  widgets?: Widget[];
} & CommonChartSettingsProps &
  Pick<ChartSettingsProps, "initial" | "computedSettings" | "question">;

export type ChartSettingsProps = {
  initial?: {
    section: string;
    widget?: Widget;
  };
  computedSettings?: ComputedVisualizationSettings;
  question?: Question;
  widgets: Widget[];
} & CommonChartSettingsProps &
  Pick<UseChartSettingsStateReturned, "chartSettings" | "transformedSeries">;

export type ChartSettingsVisualizationProps = {
  warnings?: string[];
  rawSeries: RawSeries;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  onUpdateVisualizationSettings: (
    changedSettings: VisualizationSettings,
    question: Question,
  ) => void;
  onUpdateWarnings: (warnings: string[]) => void;
} & ChartSettingsFooterProps;

export type UseChartSettingsStateProps = {
  settings?: VisualizationSettings;
  series: Series;
  onChange?: (
    settings: ComputedVisualizationSettings,
    question?: Question,
  ) => void;
};

export type UseChartSettingsStateReturned = {
  chartSettings?: VisualizationSettings;
  handleChangeSettings: (
    changedSettings: VisualizationSettings,
    question: Question,
  ) => void;
  chartSettingsRawSeries: Series;
  transformedSeries?: RawSeries | TransformedSeries;
};
