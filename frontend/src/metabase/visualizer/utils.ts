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

  let name = column.name;
  const hasDuplicate = otherReferencedColumns.some(ref => ref.name === name);
  if (hasDuplicate) {
    name = `${dataSource.name} - ${name}`;
  }

  return {
    sourceId: dataSource.id,
    originalName: column.name,
    name,
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

type CreateColumnOpts = {
  name?: string;
};

export function createMetricColumn({
  name = "METRIC_1",
}: CreateColumnOpts = {}): DatasetColumn {
  return {
    name,
    display_name: name,
    base_type: "type/Integer",
    effective_type: "type/Integer",
    field_ref: ["field", name, { "base-type": "type/Integer" }],
    source: "artificial",
  };
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

export function createDimensionColumn({
  name = "DIMENSION_1",
}: CreateColumnOpts = {}): DatasetColumn {
  return {
    name,
    display_name: name,
    base_type: "type/Text",
    effective_type: "type/Text",
    field_ref: ["field", name, { "base-type": "type/Text" }],
    source: "artificial",
  };
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

export function cloneColumnProperties(
  visualizerColumn: DatasetColumn,
  column: DatasetColumn,
) {
  const nextColumn = {
    ...visualizerColumn,
    base_type: column.base_type,
    effective_type: column.effective_type,
    display_name: column.display_name,
  };

  // TODO Remove manual MBQL manipulation
  if (isDate(column)) {
    const opts = { "base-type": column.base_type };
    const temporalUnit = maybeGetTemporalUnit(column);
    if (temporalUnit) {
      opts["temporal-unit"] = temporalUnit;
    }
    nextColumn.field_ref = [
      visualizerColumn?.field_ref?.[0] ?? "field",
      visualizerColumn?.field_ref?.[1] ?? nextColumn.name,
      opts,
    ];
  }

  return nextColumn;
}

function maybeGetTemporalUnit(col: DatasetColumn) {
  const maybeOpts = col.field_ref?.[2];
  if (maybeOpts && "temporal-unit" in maybeOpts) {
    return maybeOpts["temporal-unit"];
  }
}
