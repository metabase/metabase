import type {
  Card,
  StructuredDatasetQuery,
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

// A visualizer card has no query of its own. Goal references are answered by re-running a query with
// them attached, so the card borrows one that reads its first data source.
export function createDataSourceQuery(
  card: Pick<Card, "id" | "database_id">,
): StructuredDatasetQuery {
  return {
    type: "query",
    database: card.database_id ?? null,
    query: { "source-table": `card__${card.id}` },
  };
}

export function parseDataSourceId(id: VisualizerDataSourceId) {
  const [type, sourceId] = id.split(":");
  return { type, sourceId: Number(sourceId) };
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
