import type { WrappedResult } from "metabase/search/types";
import { createMockSearchResult } from "metabase-types/api/mocks";

export const createWrappedSearchResult = (
  options: Partial<WrappedResult>,
): WrappedResult => createMockSearchResult(options);
