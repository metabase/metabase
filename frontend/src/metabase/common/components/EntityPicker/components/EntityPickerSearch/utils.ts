import { c, msgid } from "ttag";

import type { SearchResult } from "metabase-types/api";

const emptySearchResultTranslationContext = c(
  "the title of a ui tab that contains search results",
);
const searchResultTranslationContext = c(
  "the title of a ui tab that contains search results where {0} is the number of search results and {1} is the user-supplied search query.",
);

export function getSearchTabText(
  searchResults: SearchResult[] | null,
  searchQuery: string,
): string {
  if (!searchResults || !searchResults.length) {
    return emptySearchResultTranslationContext.t`Search results`;
  }

  return searchResultTranslationContext.ngettext(
    msgid`${searchResults.length} result for "${searchQuery.trim()}"`,
    `${searchResults.length} results for "${searchQuery.trim()}"`,
    searchResults.length,
  );
}
