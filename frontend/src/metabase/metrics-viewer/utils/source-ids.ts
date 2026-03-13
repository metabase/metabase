import type { CardId, MeasureId } from "metabase-types/api";

import type { MetricSourceId } from "../types/viewer-state";

export function createMetricSourceId(cardId: CardId): MetricSourceId {
  return `metric:${cardId}`;
}

export function createMeasureSourceId(measureId: MeasureId): MetricSourceId {
  return `measure:${measureId}`;
}

export function createAdhocSourceId(uuid: string): MetricSourceId {
  return `adhoc:${uuid}`;
}

export function createSourceId(
  id: number,
  sourceType: "metric" | "measure",
): MetricSourceId {
  return sourceType === "metric"
    ? createMetricSourceId(id)
    : createMeasureSourceId(id);
}

export type ParsedSourceId =
  | { type: "metric"; id: number }
  | { type: "measure"; id: number }
  | { type: "adhoc"; uuid: string };

export function parseSourceId(sourceId: MetricSourceId): ParsedSourceId {
  const colonIdx = sourceId.indexOf(":");
  const type = sourceId.slice(0, colonIdx);
  const rest = sourceId.slice(colonIdx + 1);

  if (type === "adhoc") {
    return { type: "adhoc", uuid: rest };
  }

  if (type !== "metric" && type !== "measure") {
    throw new Error(`Invalid source ID format: ${sourceId}`);
  }
  const id = Number(rest);
  if (Number.isNaN(id)) {
    throw new Error(`Invalid source ID format: ${sourceId}`);
  }
  return { type, id };
}

export function isAdhocSourceId(sourceId: MetricSourceId): boolean {
  return sourceId.startsWith("adhoc:");
}

export function getSourceIcon(
  sourceId: MetricSourceId,
): "metric" | "ruler" | "sum" {
  const parsed = parseSourceId(sourceId);
  if (parsed.type === "metric") {
    return "metric";
  }
  if (parsed.type === "adhoc") {
    return "sum";
  }
  return "ruler";
}

let syntheticCardIdCounter = -1;

export function nextSyntheticCardId(): number {
  return --syntheticCardIdCounter;
}
