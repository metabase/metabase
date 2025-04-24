import type {
  VisualizerColumnValueSource,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerDataSourceNameReference,
  VisualizerDataSourceType,
} from "metabase-types/store/visualizer";

import { extractReferencedColumns } from "./column";

export function createDataSource(
  type: VisualizerDataSourceType,
  sourceEntityId: string,
  name: string,
): VisualizerDataSource {
  return {
    id: `${type}:${sourceEntityId}`,
    sourceEntityId,
    type,
    name,
  };
}

export function parseDataSourceId(id: VisualizerDataSourceId) {
  const [type, sourceEntityId] = id.split(":");
  return { type, sourceEntityId };
}

export function isDataSourceId(id: string): id is VisualizerDataSourceId {
  try {
    const { type, sourceEntityId } = parseDataSourceId(
      id as VisualizerDataSourceId,
    );
    return type === "card" && sourceEntityId != null;
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

export function getCardEntityIdsFromColumnValueMappings(
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
) {
  const referencedColumns = extractReferencedColumns(columnValuesMapping);
  const usedDataSourceIds = Array.from(
    new Set(referencedColumns.map((ref) => ref.sourceEntityId)),
  );
  return usedDataSourceIds.map((id) => {
    const { sourceEntityId } = parseDataSourceId(id);
    return sourceEntityId;
  });
}
