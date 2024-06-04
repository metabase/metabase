import type { ModelResult } from "metabase-types/api";
import { createMockSearchResult } from "metabase-types/api/mocks";

export const createMockModelResult = (
  model: Partial<ModelResult> = {},
): ModelResult =>
  createMockSearchResult({ ...model, model: "dataset" }) as ModelResult;
