import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type {
  Dashboard,
  DashboardCard,
  RawSeries,
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

export type ChartSettingsProps = {
  className?: string;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  initial?: {
    section: string;
    widget?: Widget;
  };
  onCancel?: () => void;
  onDone?: (settings: VisualizationSettings) => void;
  onReset?: () => void;
  onChange?: (
    settings: ComputedVisualizationSettings,
    question?: Question,
  ) => void;
  onClose?: () => void;
  rawSeries?: RawSeries[];
  settings?: VisualizationSettings;
  widgets?: Widget[];
  series: Series;
  computedSettings?: ComputedVisualizationSettings;
  isDashboard?: boolean;
  question?: Question;
  addField?: () => void;
  noPreview?: boolean;
};

export type ChartSettingsState = {
  currentSection: string | null;
  currentWidget: Widget | null;
  popoverRef?: HTMLElement | null;
  warnings?: string[];
};
