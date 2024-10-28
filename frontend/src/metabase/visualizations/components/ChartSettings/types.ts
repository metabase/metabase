import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type {
  Dashboard,
  DashboardCard,
  type RawSeries,
  Series,
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

export type DashboardChartSettingsProps = {
  className?: string;
  isDashboard?: boolean;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  onChange?: (
    settings: ComputedVisualizationSettings,
    question?: Question,
  ) => void;
  series: Series;
  onClose?: () => void;
  widgets?: Widget[];
};
export type QuestionChartSettingsProps = {
  computedSettings?: ComputedVisualizationSettings;
  question?: Question;
  onChange?: (
    settings: ComputedVisualizationSettings,
    question?: Question,
  ) => void;
  series: Series;
  initial?: {
    section: string;
    widget?: Widget;
  };
  widgets?: Widget[];
};

export type ChartSettingsProps = {
  initial?: {
    section: string;
    widget?: Widget;
  };
  series: Series;
  computedSettings?: ComputedVisualizationSettings;
  question?: Question;
  widgets: Widget[];
  onChange?: (
    settings: ComputedVisualizationSettings,
    question?: Question,
  ) => void;
};

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
  onDone: () => void;
  onCancel: () => void;
  onReset: (() => void) | null;
};
