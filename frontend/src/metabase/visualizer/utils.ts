import type { Active } from "@dnd-kit/core";
import { t } from "ttag";

import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { isNotNull } from "metabase/lib/types";
import { getColumnVizSettings } from "metabase/visualizations";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type {
  Card,
  Dataset,
  DatasetColumn,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
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
  VisualizerHistoryItem,
} from "metabase-types/store/visualizer";

import { DRAGGABLE_ID } from "./constants";

export function getDefaultVisualizationName() {
  return t`My new visualization`;
}

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

export function parseDataSourceId(id: VisualizerDataSourceId) {
  const [type, sourceId] = id.split(":");
  return { type, sourceId: Number(sourceId) };
}

export function isDataSourceId(id: string): id is VisualizerDataSourceId {
  try {
    const { type, sourceId } = parseDataSourceId(id as VisualizerDataSourceId);
    return type === "card" && Number.isSafeInteger(sourceId);
  } catch {
    return false;
  }
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

function checkColumnMappingExists(
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

  if (isPivotGroupColumn(column)) {
    return {
      sourceId: dataSource.id,
      originalName: column.name,
      name: column.name,
    };
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

const areaBarLine = ["area", "bar", "line"];

export function canCombineCard(
  display: VisualizationDisplay,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
  card: Card,
) {
  if (areaBarLine.includes(display) && areaBarLine.includes(card.display)) {
    return areAreaBarLineSeriesCompatible(columns, settings, card);
  }

  if (display === "funnel" && card.display === "scalar") {
    return columns.length === 1;
  }

  if (display === "scalar" && card.display === "scalar") {
    return columns.length === 1 && card.result_metadata.length === 1;
  }

  return false;
}

// Mimics the `area-bar-line-series-are-compatible?` fn from `GET /api/card/:id/series`
// https://github.com/metabase/metabase/blob/5cfc079d1db6e69bf42705f0eeba431a6e39c6b5/src/metabase/api/card.clj#L219
function areAreaBarLineSeriesCompatible(
  columns: DatasetColumn[],
  settings: VisualizationSettings,
  card: Card,
) {
  const initialDimensions = (settings["graph.dimensions"] ?? []).map(col =>
    columns.find(c => c.name === col),
  );
  const newDimensions = (
    card.visualization_settings["graph.dimensions"] ?? []
  ).map(col => card.result_metadata.find(c => c.name === col));
  const newMetrics = (card.visualization_settings["graph.metrics"] ?? []).map(
    col => card.result_metadata.find(c => c.name === col),
  );

  if (
    newDimensions.length === 0 ||
    newMetrics.length === 0 ||
    !newMetrics.every(isNumeric)
  ) {
    return false;
  }

  const [primaryInitialDimension] = initialDimensions;
  const [primaryNewDimension] = newDimensions;

  // both or neither primary dimension must be dates
  // both or neither primary dimension must be numeric
  // TODO handle 👇
  // a timestamp field is both date and number so don't enforce the condition if both fields are dates; see #2811
  return (
    primaryNewDimension &&
    primaryInitialDimension &&
    (isDate(primaryInitialDimension) === isDate(primaryNewDimension) ||
      isNumeric(primaryInitialDimension) !== isNumeric(primaryNewDimension))
  );
}

export function getInitialStateForCardDataSource(
  card: Card,
  dataset: Dataset,
): VisualizerHistoryItem {
  const state: VisualizerHistoryItem = {
    display: card.display,
    columns: [],
    columnValuesMapping: {},
    settings: {},
  };
  const dataSource = createDataSource("card", card.id, card.name);

  dataset.data.cols.forEach(column => {
    const columnRef = createVisualizerColumnReference(
      dataSource,
      column,
      extractReferencedColumns(state.columnValuesMapping),
    );
    state.columns.push(copyColumn(columnRef.name, column));
    state.columnValuesMapping[columnRef.name] = [columnRef];
  });

  const entries = getColumnVizSettings(card.display)
    .map(setting => {
      const originalValue = card.visualization_settings[setting];

      if (!originalValue) {
        return null;
      }

      if (Array.isArray(originalValue)) {
        return [
          setting,
          originalValue.map(originalColumnName => {
            const index = dataset.data.cols.findIndex(
              col => col.name === originalColumnName,
            );
            return state.columns[index].name;
          }),
        ];
      } else {
        const index = dataset.data.cols.findIndex(
          col => col.name === originalValue,
        );
        return [setting, state.columns[index].name];
      }
    })
    .filter(isNotNull);

  state.settings = {
    ...card.visualization_settings,
    ...Object.fromEntries(entries),
  };

  return state;
}
