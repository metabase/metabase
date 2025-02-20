import type {
  VisualizerColumnValueSource,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerDataSourceNameReference,
  VisualizerDataSourceType,
} from "metabase-types/store/visualizer";

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
