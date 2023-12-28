import { createMockSearchResult } from "metabase-types/api/mocks";
import type { WrappedResult } from "metabase/search/types";

export const createWrappedSearchResult = (
  options: Partial<WrappedResult>,
): WrappedResult => {
  const result = createMockSearchResult(options);

  return {
    ...result,
    getUrl: options.getUrl ?? (() => "/collection/root"),
    getIcon: options.getIcon ?? (() => ({ name: "folder" })),
    getCollection: options.getCollection ?? (() => result.collection),
  };
};
