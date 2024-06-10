import type { RecentCollectionItem } from "metabase-types/api";
import {
  createMockRecentCollectionItem,
  createMockSearchResult,
} from "metabase-types/api/mocks";

import type { ModelResult, RecentModel } from "./types";

export const createMockModelResult = (
  model: Partial<ModelResult> = {},
): ModelResult =>
  createMockSearchResult({ ...model, model: "dataset" }) as ModelResult;

export const createMockRecentModel = (
  model: Partial<RecentCollectionItem>,
): RecentModel =>
  createMockRecentCollectionItem({ ...model, model: "dataset" }) as RecentModel;
