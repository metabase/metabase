import type { CardId, MeasureId } from "metabase-types/api";

import type { MetricSourceId } from "../types/viewer-state";

export function createMetricSourceId(cardId: CardId): MetricSourceId {
  return `metric:${cardId}`;
}

export function createMeasureSourceId(measureId: MeasureId): MetricSourceId {
  return `measure:${measureId}`;
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

const MEASURE_ID_OFFSET = -1000000;

export function measureToCardId(measureId: MeasureId): number {
  return MEASURE_ID_OFFSET - measureId;
}

export function isMeasureCardId(cardId: number): boolean {
  return cardId <= MEASURE_ID_OFFSET;
}

export function cardIdToMeasureId(cardId: number): MeasureId {
  return MEASURE_ID_OFFSET - cardId;
}
