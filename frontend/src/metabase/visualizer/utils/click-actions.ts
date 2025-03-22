import type { ClickObject } from "metabase/visualizations/types";
import type { DatasetColumn, RawSeries } from "metabase-types/api";
import type { VisualizerColumnValueSource } from "metabase-types/store/visualizer";

import { isDataSourceNameRef, parseDataSourceId } from "./data-source";

export function formatVisualizerClickObject(
  clicked: ClickObject,
  originalSeries: RawSeries,
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
): ClickObject {
  const object = { ...clicked };

  if (object.column) {
    object.cardId = findColumnCardId(object.column, columnValuesMapping);
    object.column = findRealColumn(
      object.column,
      originalSeries,
      columnValuesMapping,
    );
  }

  if (Array.isArray(object.data)) {
    object.data = object.data.map(item => {
      const col = item.col
        ? findRealColumn(item.col, originalSeries, columnValuesMapping)
        : item.col;
      return {
        ...item,
        col: col ?? null,
      };
    });
  }

  if (Array.isArray(object.dimensions)) {
    object.dimensions = object.dimensions.map(item => {
      const column = item.column
        ? findRealColumn(item.column, originalSeries, columnValuesMapping)
        : item.column;
      return {
        ...item,
        column: column ?? item.column,
      };
    });
  }

  return object;
}

function findColumnCardId(
  column: DatasetColumn,
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
) {
  const [valueSource] = columnValuesMapping[column.name] ?? [];
  if (!valueSource || isDataSourceNameRef(valueSource)) {
    return;
  }
  return parseDataSourceId(valueSource.sourceId).sourceId;
}

function findRealColumn(
  column: DatasetColumn,
  originalSeries: RawSeries,
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
) {
  const [valueSource] = columnValuesMapping[column.name] ?? [];

  if (!valueSource || isDataSourceNameRef(valueSource)) {
    return;
  }

  const cardId = parseDataSourceId(valueSource.sourceId).sourceId;
  const cardSeries = originalSeries.find(series => series.card.id === cardId);

  return cardSeries?.data?.cols?.find(
    col => col.name === valueSource.originalName,
  );
}
