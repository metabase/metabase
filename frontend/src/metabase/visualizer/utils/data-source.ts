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
  sourceId: string,
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
  return { type, sourceId };
}

const DATA_SOURCE_NAME_REF_PREFIX = "$_";
const DATA_SOURCE_NAME_REF_SUFFIX = "_name";

export function createDataSourceNameRef(
  id: VisualizerDataSourceId,
): VisualizerDataSourceNameReference {
  return `${DATA_SOURCE_NAME_REF_PREFIX}${id}${DATA_SOURCE_NAME_REF_SUFFIX}`;
}

export function isDataSourceNameRef(
  value: VisualizerColumnValueSource,
): value is VisualizerDataSourceNameReference {
  return (
    typeof value === "string" &&
    value.startsWith(DATA_SOURCE_NAME_REF_PREFIX) &&
    value.endsWith(DATA_SOURCE_NAME_REF_SUFFIX)
  );
}

export function getDataSourceIdFromNameRef(str: string) {
  return str.substring(
    DATA_SOURCE_NAME_REF_PREFIX.length,
    str.length - DATA_SOURCE_NAME_REF_SUFFIX.length,
  );
}

export function getDataSourceIdsFromColumnValueMappings(
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
) {
  const referencedColumns = extractReferencedColumns(columnValuesMapping);
  return Array.from(new Set(referencedColumns.map((ref) => ref.sourceId)));
}
