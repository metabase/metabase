import type { CardOrSearchResult } from "./models";
import { question } from "./questions";

const METRICS_VIEWER_ROOT = "/explore";

export function metricsViewer(hash?: string): string {
  if (hash) {
    return `${METRICS_VIEWER_ROOT}#${hash}`;
  }
  return METRICS_VIEWER_ROOT;
}

export function exploreMetric(metricId: number): string {
  return `${METRICS_VIEWER_ROOT}?metricId=${metricId}`;
}

export function metric(card: CardOrSearchResult): string {
  const id = card.card_id ?? card.id;
  const numericId = typeof id === "number" ? id : parseInt(String(id), 10);
  if (!isNaN(numericId)) {
    return exploreMetric(numericId);
  }
  return question(card);
}

export function metricQuestionUrl(card: CardOrSearchResult): string {
  return question({ ...card, type: "metric" });
}
