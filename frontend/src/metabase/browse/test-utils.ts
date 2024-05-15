import { createMockSearchResult } from "metabase-types/api/mocks";

import type { ModelResult } from "./types";

export const createMockModelResult = (
  model: Partial<ModelResult>,
): ModelResult =>
  createMockSearchResult({ ...model, model: "dataset" }) as ModelResult;
