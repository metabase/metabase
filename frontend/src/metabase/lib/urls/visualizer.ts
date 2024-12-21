import type { VisualizerDataSourceType } from "metabase-types/store/visualizer";

export function visualizer(
  dataSourceType: VisualizerDataSourceType,
  dataSourceId: number,
) {
  return `/visualizer?dataSource=${dataSourceType}:${dataSourceId}`;
}
