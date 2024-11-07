import type { Active } from "@dnd-kit/core";

import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn } from "metabase-types/api";
import type {
  DraggedColumn,
  DraggedItem,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerDataSourceType,
  VisualizerReferencedColumn,
} from "metabase-types/store/visualizer";

import { DRAGGABLE_ID } from "./constants";

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
  const alreadyReferenced = otherReferencedColumns.find(
    ref =>
      ref.sourceId === dataSource.id && ref.columnKey === getColumnKey(column),
  );
  if (alreadyReferenced) {
    return alreadyReferenced;
  }

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

type DndItem = Omit<Active, "rect">;

export function isDraggedColumnItem(item: DndItem): item is DraggedColumn {
  return item.data?.current?.type === DRAGGABLE_ID.COLUMN;
}

export function isValidDraggedItem(item: DndItem): item is DraggedItem {
  return isDraggedColumnItem(item);
}
