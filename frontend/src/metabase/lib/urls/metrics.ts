import slugg from "slugg";

import type { CardOrSearchResult } from "./models";
import { question } from "./questions";
import { appendSlug } from "./utils";

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
  if (id == null) {
    return "/metric";
  }
  let path = `/metric/${id}`;
  if (card.name) {
    path = appendSlug(path, slugg(card.name));
  }
  return path;
}

export function metricQuestionUrl(card: CardOrSearchResult): string {
  return question({ ...card, type: "metric" });
}
