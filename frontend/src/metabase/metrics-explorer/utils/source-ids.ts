import type { CardId, ConcreteTableId, MeasureId } from "metabase-types/api";
import type {
  MetricSourceId,
  SerializedSource,
} from "metabase-types/store/metrics-explorer";

/**
 * Create a MetricSourceId for a metric (card).
 */
export function createMetricSourceId(cardId: CardId): MetricSourceId {
  return `metric:${cardId}`;
}

/**
 * Create a MetricSourceId for a measure.
 */
export function createMeasureSourceId(measureId: MeasureId): MetricSourceId {
  return `measure:${measureId}`;
}

/**
 * Parse a MetricSourceId into its type and numeric ID.
 * @throws Error if the ID portion is not a valid number
 */
export function parseSourceId(sourceId: MetricSourceId): {
  type: "metric" | "measure";
  id: number;
} {
  const [type, idStr] = sourceId.split(":") as ["metric" | "measure", string];
  const id = Number(idStr);
  if (Number.isNaN(id)) {
    throw new Error(`Invalid source ID format: ${sourceId}`);
  }
  return { type, id };
}

/**
 * Check if a source ID is for a metric.
 */
export function isMetricSourceId(sourceId: MetricSourceId): boolean {
  return sourceId.startsWith("metric:");
}

/**
 * Check if a source ID is for a measure.
 */
export function isMeasureSourceId(sourceId: MetricSourceId): boolean {
  return sourceId.startsWith("measure:");
}

/**
 * Get the measure ID from a measure source ID.
 */
export function getMeasureIdFromSourceId(sourceId: MetricSourceId): MeasureId {
  const { type, id } = parseSourceId(sourceId);
  if (type !== "measure") {
    throw new Error(`Expected measure source ID, got: ${sourceId}`);
  }
  return id;
}

// Use negative IDs for measure "cards" to avoid collision with real card IDs
const MEASURE_ID_OFFSET = -1000000;

/**
 * Convert a measure ID to a synthetic card ID for visualization.
 * Uses negative IDs to avoid collision with real card IDs.
 */
export function measureToCardId(measureId: MeasureId): number {
  return MEASURE_ID_OFFSET - measureId;
}

/**
 * Convert a synthetic card ID back to a measure ID.
 */
export function cardIdToMeasureId(cardId: number): MeasureId {
  return -(cardId - MEASURE_ID_OFFSET);
}

/**
 * Check if a card ID is a synthetic measure card ID.
 */
export function isMeasureCardId(cardId: number): boolean {
  return cardId < 0;
}

/**
 * Convert a visualization card ID to a MetricSourceId.
 * Handles both real card IDs (metrics) and synthetic negative IDs (measures).
 */
export function cardIdToSourceId(cardId: number): MetricSourceId {
  if (isMeasureCardId(cardId)) {
    return createMeasureSourceId(cardIdToMeasureId(cardId));
  }
  return createMetricSourceId(cardId);
}

/**
 * Convert a SerializedSource to a MetricSourceId.
 */
export function serializedSourceToId(source: SerializedSource): MetricSourceId {
  if (source.type === "metric") {
    return createMetricSourceId(source.id);
  }
  return createMeasureSourceId(source.id);
}

/**
 * Convert a metric source ID to a SerializedSource.
 */
export function metricIdToSerializedSource(
  sourceId: MetricSourceId,
): SerializedSource {
  const { id } = parseSourceId(sourceId);
  return { type: "metric", id };
}

/**
 * Convert a measure source ID to a SerializedSource.
 * Requires tableId since measures need it for URL serialization.
 */
export function measureIdToSerializedSource(
  sourceId: MetricSourceId,
  tableId: ConcreteTableId,
): SerializedSource {
  const { id } = parseSourceId(sourceId);
  return { type: "measure", id, tableId };
}

/**
 * Normalize a serialized source from old abbreviated format to new format.
 * Handles backward compatibility with URLs using t: "m"/"s" format.
 */
export function normalizeSerializedSource(
  value: unknown,
): SerializedSource | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const obj = value as Record<string, unknown>;

  // New format: type: "metric" / "measure"
  if (obj.type === "metric" && typeof obj.id === "number" && obj.id > 0) {
    return { type: "metric", id: obj.id };
  }
  if (
    obj.type === "measure" &&
    typeof obj.id === "number" &&
    obj.id > 0 &&
    typeof obj.tableId === "number" &&
    obj.tableId > 0
  ) {
    return { type: "measure", id: obj.id, tableId: obj.tableId };
  }

  // Old abbreviated format: t: "m"/"s" - convert to new format
  if (obj.t === "m" && typeof obj.id === "number" && obj.id > 0) {
    return { type: "metric", id: obj.id };
  }
  if (
    obj.t === "s" &&
    typeof obj.id === "number" &&
    obj.id > 0 &&
    typeof obj.tid === "number" &&
    obj.tid > 0
  ) {
    return { type: "measure", id: obj.id, tableId: obj.tid };
  }

  return null;
}

/**
 * Type guard to check if a serialized source is valid.
 */
export function isValidSerializedSource(
  value: unknown,
): value is SerializedSource {
  return normalizeSerializedSource(value) !== null;
}
