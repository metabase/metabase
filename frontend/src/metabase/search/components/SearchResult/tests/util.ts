import type { WrappedResult } from "metabase/search/types";
import { createMockSearchResult } from "metabase-types/api/mocks";

export const createWrappedSearchResult = (
  options: Partial<WrappedResult>,
): WrappedResult => {
  const result = createMockSearchResult(options);

  return {
    ...result,
    getCollection: options.getCollection ?? (() => result.collection),
  };
};
