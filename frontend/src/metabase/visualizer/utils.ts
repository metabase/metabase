import type { Active } from "@dnd-kit/core";

import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";
import type {
  DraggedColumn,
  DraggedItem,
  DraggedWellItem,
  VisualizerColumnReference,
  VisualizerColumnValueSource,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerDataSourceNameReference,
  VisualizerDataSourceType,
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

export function isReferenceToColumn(
  column: DatasetColumn,
  dataSourceId: VisualizerDataSourceId,
  ref: VisualizerColumnReference,
) {
  return dataSourceId === ref.sourceId && column.name === ref.originalName;
}

export function compareColumnReferences(
  r1: VisualizerColumnReference,
  r2: VisualizerColumnReference,
) {
  return r1.sourceId === r2.sourceId && r1.originalName === r2.originalName;
}

export function checkColumnMappingExists(
  columnValueSources: VisualizerColumnValueSource[],
  valueSource: VisualizerColumnValueSource,
) {
  if (typeof valueSource === "string") {
    return columnValueSources.includes(valueSource);
  }

  return columnValueSources.some(
    source =>
      typeof source !== "string" &&
      compareColumnReferences(source, valueSource),
  );
}

export function createVisualizerColumnReference(
  dataSource: VisualizerDataSource,
  column: DatasetColumn,
  otherReferencedColumns: VisualizerColumnReference[],
): VisualizerColumnReference {
  const existingRef = otherReferencedColumns.find(ref =>
    isReferenceToColumn(column, dataSource.id, ref),
  );
  if (existingRef) {
    return existingRef;
  }

  let nameIndex = otherReferencedColumns.length + 1;
  let hasDuplicate = otherReferencedColumns.some(
    ref => ref.name === `COLUMN_${nameIndex}`,
  );
  while (hasDuplicate) {
    nameIndex++;
    hasDuplicate = otherReferencedColumns.some(
      ref => ref.name === `COLUMN_${nameIndex}`,
    );
  }

  return {
    sourceId: dataSource.id,
    originalName: column.name,
    name: `COLUMN_${nameIndex}`,
  };
}

export function createDataSourceNameRef(
  id: VisualizerDataSourceId,
): VisualizerDataSourceNameReference {
  return `$_${id}_name`;
}

export function isDataSourceNameRef(
  value: VisualizerColumnValueSource,
): value is VisualizerDataSourceNameReference {
  return (
    typeof value === "string" &&
    value.startsWith("$_") &&
    value.endsWith("_name")
  );
}

export function getDataSourceIdFromNameRef(str: string) {
  const [, dataSourceId] = str.split("_");
  return dataSourceId;
}

type DndItem = Omit<Active, "rect">;

export function isDraggedColumnItem(item: DndItem): item is DraggedColumn {
  return item.data?.current?.type === DRAGGABLE_ID.COLUMN;
}

export function isDraggedWellItem(item: DndItem): item is DraggedWellItem {
  return item.data?.current?.type === DRAGGABLE_ID.WELL_ITEM;
}

export function isValidDraggedItem(item: DndItem): item is DraggedItem {
  return isDraggedColumnItem(item) || isDraggedWellItem(item);
}

export function copyColumn(name: string, column: DatasetColumn): DatasetColumn {
  const copy: DatasetColumn = {
    ...column,
    name,
    field_ref: ["field", name, { "base-type": column.base_type }],
  };

  // TODO Remove manual MBQL manipulation
  if (isDate(column)) {
    const opts = copy.field_ref[2];
    const temporalUnit = maybeGetTemporalUnit(column);
    if (temporalUnit) {
      opts["temporal-unit"] = temporalUnit;
    }
    copy.field_ref = ["field", name, opts];
  }

  return copy;
}

export function addColumnMapping(
  mapping: VisualizerColumnValueSource[] | undefined,
  source: VisualizerColumnValueSource,
) {
  const nextMapping = mapping ? [...mapping] : [];
  if (!checkColumnMappingExists(nextMapping, source)) {
    nextMapping.push(source);
  }
  return nextMapping;
}

export function extractReferencedColumns(
  mappings: Record<string, VisualizerColumnValueSource[]>,
): VisualizerColumnReference[] {
  const sources = Object.values(mappings).flat();
  return sources.filter(
    (valueSource): valueSource is VisualizerColumnReference =>
      typeof valueSource !== "string",
  );
}

function maybeGetTemporalUnit(col: DatasetColumn) {
  const maybeOpts = col.field_ref?.[2];
  if (maybeOpts && "temporal-unit" in maybeOpts) {
    return maybeOpts["temporal-unit"];
  }
}
