import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type {
  Dashboard,
  DashboardCard,
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

export type ChartSettingsWithStateProps = {
  className?: string;
  isDashboard?: boolean;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  initial?: {
    section: string;
    widget?: Widget;
  };
  onClose?: () => void;
  series: Series;
  computedSettings?: ComputedVisualizationSettings;
  question?: Question;
  noPreview?: boolean;
  widgets?: Widget[];

  onChange?: (
    settings: ComputedVisualizationSettings,
    question?: Question,
  ) => void;
  settings?: VisualizationSettings;
};

export type ChartSettingsProps = ChartSettingsWithStateProps & {
  onDone?: (settings: VisualizationSettings) => void;
};
