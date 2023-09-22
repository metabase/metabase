import type { DatasetData, VisualizationSettings } from "metabase-types/api";
import type { ColorGetter } from "metabase/static-viz/lib/colors";

export interface StaticChartProps {
  data: DatasetData;
  settings: VisualizationSettings;
  getColor: ColorGetter;
}
