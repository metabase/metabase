import { PieChartShared } from "metabase/visualizations/echarts/visualizations/PieChart/PieChartShared";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";

export function PieChart({
  data,
  settings,
}: {
  data: DatasetData;
  settings: VisualizationSettings;
}) {
  return <PieChartShared data={data} settings={settings} />;
}
