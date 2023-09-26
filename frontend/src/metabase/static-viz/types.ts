import type {
  DatasetData,
  VisualizationSettings,
  RawSeries,
} from "metabase-types/api";
import type {
  ColorGetter,
  RenderingEnvironment,
} from "metabase/visualizations/types";

export interface StaticChartProps {
  data: DatasetData;
  settings: VisualizationSettings;
  getColor: ColorGetter;
  // TODO: add timeline events
}

export interface IsomorphicChartProps {
  rawSeries: RawSeries;
  environment: RenderingEnvironment;
}
