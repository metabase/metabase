import type { CardId, MeasureId } from "metabase-types/api";

import type { MetricSourceId } from "../types/viewer-state";

export function createMetricSourceId(cardId: CardId): MetricSourceId {
  return `metric:${cardId}`;
}

export function createMeasureSourceId(measureId: MeasureId): MetricSourceId {
  return `measure:${measureId}`;
}

export function createSourceId(
  id: number,
  sourceType: "metric" | "measure",
): MetricSourceId {
  return sourceType === "metric"
    ? createMetricSourceId(id)
    : createMeasureSourceId(id);
}

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

export function getSourceIcon(sourceId: MetricSourceId): "metric" | "ruler" {
  return parseSourceId(sourceId).type === "metric" ? "metric" : "ruler";
}

let syntheticCardIdCounter = -1;

export function nextSyntheticCardId(): number {
  return --syntheticCardIdCounter;
}
