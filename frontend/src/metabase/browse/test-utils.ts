import type { RecentCollectionItem } from "metabase-types/api";
import {
  createMockRecentCollectionItem,
  createMockSearchResult,
} from "metabase-types/api/mocks";

import type {
  MetricResult,
  ModelResult,
  RecentMetric,
  RecentModel,
} from "./types";

export const createMockModelResult = (
  model: Partial<ModelResult> = {},
): ModelResult =>
  createMockSearchResult({ ...model, model: "dataset" }) as ModelResult;

export const createMockRecentModel = (
  model: Partial<RecentCollectionItem>,
): RecentModel =>
  createMockRecentCollectionItem({ ...model, model: "dataset" }) as RecentModel;

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
