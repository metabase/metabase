import type {
  VisualizerColumnValueSource,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerDataSourceNameReference,
  VisualizerDataSourceType,
} from "metabase-types/api";

import { extractReferencedColumns } from "./column";

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

export function getDataSourceIdsFromColumnValueMappings(
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
) {
  const referencedColumns = extractReferencedColumns(columnValuesMapping);
  return Array.from(new Set(referencedColumns.map((ref) => ref.sourceId)));
}

export function getCardIdsFromColumnValueMappings(
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
) {
  const usedDataSourceIds =
    getDataSourceIdsFromColumnValueMappings(columnValuesMapping);
  return usedDataSourceIds.map((id) => {
    const { sourceId } = parseDataSourceId(id);
    return sourceId;
  });
}
