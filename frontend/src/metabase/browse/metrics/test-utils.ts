import {
  createMockRecentCollectionItem,
  createMockSearchResult,
} from "metabase-types/api/mocks";

import type { MetricResult, RecentMetric } from "./types";

export const createMockMetricResult = (
  metric: Partial<MetricResult> = {},
): MetricResult =>
  createMockSearchResult({ ...metric, model: "metric" }) as MetricResult;

export const createMockRecentMetric = (
  metric: Partial<RecentMetric>,
): RecentMetric =>
  createMockRecentCollectionItem({
    ...metric,
    model: "metric",
  }) as RecentMetric;
