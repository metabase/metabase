import type Question from "metabase-lib/v1/Question";
import type { Series, VisualizationSettings } from "metabase-types/api";

// this type is not full, we need to extend it later
export type Widget = {
  id: string;
  section: string;
  hidden?: boolean;
  props: Record<string, unknown>;
  title?: string;
  widget?: string | React.ComponentType<any>;
};

export type CommonChartSettingsProps = {
  series: Series;
  settings?: VisualizationSettings;
  onChange?: (settings: VisualizationSettings, question?: Question) => void;
};
