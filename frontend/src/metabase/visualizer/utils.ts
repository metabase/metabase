import type {
  VisualizerDataSource,
  VisualizerDataSourceType,
} from "metabase-types/store/visualizer";

export function createDataSource(
  type: VisualizerDataSourceType,
  sourceId: number,
  name: string,
): VisualizerDataSource {
  return {
    id: `${type}:${sourceId}`,
    sourceId,
    type,
    name,
  };
}
