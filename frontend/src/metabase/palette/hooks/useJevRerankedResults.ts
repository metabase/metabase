import { useMemo } from "react";

import { useJevSearchRerankQuery } from "metabase/api/jev-search";
import type { SearchResponse } from "metabase-types/api";

import {
  type JevRanking,
  applyJevRanking,
  getRecallTerms,
  isJevEligibleQuery,
} from "../jev-rerank";

interface UseJevRerankedResultsProps {
  /** The (already debounced) text the keyword results were fetched for. */
  searchText: string;
  searchResults: SearchResponse | undefined;
  disabled: boolean;
}

interface UseJevRerankedResults {
  ranking: JevRanking | null;
  isReranking: boolean;
}

/**
 * Jev re-ranks the palette's keyword results for natural-language queries. Keyword results render
 * immediately; the ranking only replaces them once it lands for the current text (`currentData`
 * ignores stale responses), and any Jev failure leaves them untouched.
 */
export const useJevRerankedResults = ({
  searchText,
  searchResults,
  disabled,
}: UseJevRerankedResultsProps): UseJevRerankedResults => {
  const isEligible =
    !disabled && searchResults != null && isJevEligibleQuery(searchText);

  const args = useMemo(
    () => ({
      q: searchText,
      keywordResults: searchResults?.data ?? [],
      recallTerms: getRecallTerms(searchText),
    }),
    [searchText, searchResults],
  );

  const { currentData, isFetching } = useJevSearchRerankQuery(args, {
    skip: !isEligible,
  });

  const ranking = useMemo(
    () => (isEligible && currentData ? applyJevRanking(currentData) : null),
    [isEligible, currentData],
  );

  return { ranking, isReranking: isEligible && isFetching };
};
