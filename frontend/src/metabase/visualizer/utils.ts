import visualizations from "metabase/visualizations";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn } from "metabase-types/api";
import type {
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerDataSourceType,
  VisualizerReferencedColumn,
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

export function createVisualizerColumnReference(
  dataSource: VisualizerDataSource,
  column: DatasetColumn,
  otherReferencedColumns: VisualizerReferencedColumn[],
): VisualizerReferencedColumn {
  let name = column.name;

  const hasDuplicate = otherReferencedColumns.some(ref => ref.name === name);
  if (hasDuplicate) {
    name = `${dataSource.name} - ${name}`;
  }

  return {
    sourceId: dataSource.id,
    columnKey: getColumnKey(column),
    name,
  };
}

export function createDataSourceNameRef(id: VisualizerDataSourceId) {
  return `$_${id}_name`;
}

export function isDataSourceNameRef(str: string) {
  return str.startsWith("$_") && str.endsWith("_name");
}

export function getDataSourceIdFromNameRef(str: string) {
  const [, dataSourceId] = str.split("_");
  return dataSourceId;
}

export const vizTypes = Array.from(visualizations).map(([vizType, viz]) => ({
  label: viz.uiName,
  value: vizType,
  icon: viz.iconName,
}));
