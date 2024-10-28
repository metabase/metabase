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
import type { QueryBuilderUIControls } from "metabase-types/store";

// this type is not full, we need to extend it later
export type Widget = {
  id: string;
  section: string;
  hidden?: boolean;
  props: Record<string, unknown>;
  title?: string;
  widget: (() => JSX.Element | null) | undefined;
  group?: string;
};

export type SectionRadioProps = {
  currentSection: string;
  options: string[];
  setCurrentWidget: (widget: Widget | null) => void;
  setCurrentSection: (sectionName: string | null) => void;
};

export type WidgetListProps = {
  chartSettings: VisualizationSettings;
  series: Series;
  onChange: (
    settings: ComputedVisualizationSettings,
    question?: Question,
  ) => void;
  widgets: Widget[];
  visibleWidgets: Widget[];
  question?: Question;
  computedSettings?: ComputedVisualizationSettings;
  setCurrentWidget: (widget: Widget | null) => void;
  transformedSeries: RawSeries | TransformedSeries;
  currentWidget: Widget | null;
};

export type ChartSettingsProps = {
  series: Series;
  onChange: (
    settings: ComputedVisualizationSettings,
    question?: Question,
  ) => void;
  isDashboard?: boolean;
  dashboard?: Dashboard;
  settings?: VisualizationSettings;
  question?: Question;
  initial?: QueryBuilderUIControls["initialChartSetting"];
  computedSettings?: ComputedVisualizationSettings;
  widgets?: Widget[];
};

export type ChartSettingsWithStateProps = Pick<
  ChartSettingsProps,
  "series" | "onChange" | "isDashboard" | "dashboard" | "widgets"
> & {
  dashcard?: DashboardCard;
  onClose: () => void;
};

export type ChartSettingsInnerProps = {
  chartSettings: VisualizationSettings;
  computedSettings?: ComputedVisualizationSettings;
  finalWidgetList: Widget[];
  initial?: QueryBuilderUIControls["initialChartSetting"];
  onChange: (
    settings: ComputedVisualizationSettings,
    question?: Question,
  ) => void;
  question?: Question;
  series: Series;
  transformedSeries: RawSeries | TransformedSeries;
};

export type UseChartSectionsProps = {
  widgets: Widget[];
  initial?: QueryBuilderUIControls["initialChartSetting"];
};

export type UseChartSettingsStateProps = {
  settings?: VisualizationSettings;
  series: Series;
  onChange: (
    changedSettings: VisualizationSettings,
    question?: Question,
  ) => void;
  widgets?: Widget[];
  isDashboard?: boolean;
  dashboard?: Dashboard;
};
