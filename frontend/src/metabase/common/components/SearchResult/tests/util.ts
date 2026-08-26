import type { SearchResult } from "metabase-types/api";
import { createMockSearchResult } from "metabase-types/api/mocks";

export const createWrappedSearchResult = (
  options: Partial<SearchResult>,
): SearchResult => createMockSearchResult(options);
