import _ from "underscore";

import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { isDate, isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  VisualizerColumnReference,
  VisualizerColumnValueSource,
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/api";

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
    (source) =>
      typeof source !== "string" &&
      compareColumnReferences(source, valueSource),
  );
}

export function createVisualizerColumnReference(
  dataSource: VisualizerDataSource,
  column: DatasetColumn,
  otherReferencedColumns: VisualizerColumnReference[],
): VisualizerColumnReference {
  const existingRef = otherReferencedColumns.find((ref) =>
    isReferenceToColumn(column, dataSource.id, ref),
  );
  if (existingRef) {
    return existingRef;
  }

  let nameIndex = otherReferencedColumns.length + 1;
  let hasDuplicate = otherReferencedColumns.some(
    (ref) => ref.name === `COLUMN_${nameIndex}`,
  );
  while (hasDuplicate) {
    nameIndex++;
    hasDuplicate = otherReferencedColumns.some(
      (ref) => ref.name === `COLUMN_${nameIndex}`,
    );
  }

  return {
    sourceId: dataSource.id,
    originalName: column.name,
    name: `COLUMN_${nameIndex}`,
  };
}

export function copyColumn(
  name: string,
  column: DatasetColumn,
  dataSourceName: string,
  existingColumns: DatasetColumn[],
): DatasetColumn {
  const copy: DatasetColumn = { ...column, name };

  if (existingColumns.some((col) => col.display_name === copy.display_name)) {
    copy.display_name = `${copy.display_name} (${dataSourceName})`;
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

export function isArtificialColumn(column: DatasetColumn) {
  return column.source === "artificial";
}

export function partitionTimeDimensions(columns: DatasetColumn[]): {
  dimensions: DatasetColumn[];
  timeDimensions: DatasetColumn[];
  otherDimensions: DatasetColumn[];
} {
  // Extract only dimension columns (exclude metrics and pivot group columns)
  const dimensions = columns.filter(
    (col) => isDimension(col) && !isMetric(col) && !isPivotGroupColumn(col),
  );

  // Partition temporal & non-temporal dimensions
  const [timeDimensions, otherDimensions] = _.partition(dimensions, (col) =>
    isDate(col),
  );

  return { dimensions, timeDimensions, otherDimensions };
}
