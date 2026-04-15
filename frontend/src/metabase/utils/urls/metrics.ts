import type { DimensionType } from "metabase/metrics/common/utils/dimension-types";
import type { MetricsViewerDisplayType } from "metabase/metrics-viewer/types/viewer-state";
import {
  type SerializedMetricsViewerPageState,
  encodeState,
} from "metabase/metrics-viewer/utils/url-serialization";
import type { CardId, CollectionId } from "metabase-types/api";

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

export interface ExploreMetricDimensionOptions {
  metricId: number;
  dimensionId: string;
  dimensionType: DimensionType;
  displayType: MetricsViewerDisplayType;
  label?: string;
}

export function exploreMetricDimension({
  metricId,
  dimensionId,
  dimensionType,
  displayType,
  label,
}: ExploreMetricDimensionOptions): string {
  const state: SerializedMetricsViewerPageState = {
    formulaEntities: [{ type: "metric", id: metricId }],
    tabs: [
      {
        id: dimensionId,
        type: dimensionType,
        label: label ?? null,
        display: displayType,
        definitions: [{ slotIndex: 0, dimensionId }],
      },
    ],
    selectedTabId: dimensionId,
  };

  const hash = encodeState(state);
  return hash ? metricsViewer(hash) : exploreMetric(metricId);
}

export function metricAbout(cardId: CardId): string {
  return `/metric/${cardId}`;
}

export function metricOverview(cardId: CardId): string {
  return `/metric/${cardId}/overview`;
}

export function metricQuery(cardId: CardId): string {
  return `/metric/${cardId}/query`;
}

export function metricDependencies(cardId: CardId): string {
  return `/metric/${cardId}/dependencies`;
}

export function metricCaching(cardId: CardId): string {
  return `/metric/${cardId}/caching`;
}

export function metricHistory(cardId: CardId): string {
  return `/metric/${cardId}/history`;
}

export function newMetric(
  params: { collectionId?: CollectionId } = {},
): string {
  const searchParams = new URLSearchParams();
  if (params.collectionId != null) {
    searchParams.set("collectionId", String(params.collectionId));
  }
  const queryString = searchParams.toString();
  return `/metric/new${queryString ? `?${queryString}` : ""}`;
}

export function metric(card: CardOrSearchResult): string {
  const id = card.card_id ?? card.id;
  const numericId = typeof id === "number" ? id : parseInt(String(id), 10);
  if (!isNaN(numericId)) {
    return metricAbout(numericId);
  }
  return question(card);
}

export function metricQuestionUrl(card: CardOrSearchResult): string {
  return question({ ...card, type: "metric" });
}
