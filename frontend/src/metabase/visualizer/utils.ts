import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn } from "metabase-types/api";
import type {
  VisualizerColumnImport,
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

export function createColumnImport(
  dataSource: VisualizerDataSource,
  column: DatasetColumn,
): VisualizerColumnImport {
  return {
    sourceId: dataSource.id,
    columnKey: getColumnKey(column),
    name: column.name,
  };
}
