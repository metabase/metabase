import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";
import type {
  VisualizerColumnReference,
  VisualizerColumnValueSource,
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

export function isReferenceToColumn(
  column: Field,
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
  column: Field,
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

export function copyColumn(name: string, column: Field): Field {
  const copy: Field = {
    ...column,
    name,
    field_ref: ["field", name, { "base-type": column.base_type }],
  };

  // TODO Remove manual MBQL manipulation
  if (isDate(column)) {
    const opts = copy.field_ref?.[2];
    const temporalUnit = maybeGetTemporalUnit(column);
    if (temporalUnit && opts) {
      // TODO fix type
      (opts as any)["temporal-unit"] = temporalUnit;
    }
    // TODO fix type
    copy.field_ref = ["field", name, opts as any];
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

function maybeGetTemporalUnit(col: Field) {
  const maybeOpts = col.field_ref?.[2];
  if (maybeOpts && "temporal-unit" in maybeOpts) {
    return maybeOpts["temporal-unit"];
  }
}
