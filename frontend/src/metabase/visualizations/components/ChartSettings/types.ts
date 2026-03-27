import type Question from "metabase-lib/v1/Question";
import type { Series, VisualizationSettings } from "metabase-types/api";

export type CommonChartSettingsProps = {
  series: Series;
  settings?: VisualizationSettings;
  onChange?: (settings: VisualizationSettings, question?: Question) => void;
};
