import { t } from "ttag";

import type { SearchResult } from "metabase-types/api";

export function getSearchTabText(
  _searchResults: SearchResult[] | null,
  searchQuery: string,
): string {
  return t`Results for "${searchQuery.trim()}"`;
}
