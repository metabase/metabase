import { msgid, ngettext } from "ttag";

import { SearchResult } from "metabase/search/components/SearchResult";
import { Paper, Stack, Text } from "metabase/ui";
import type { SearchResult as ApiSearchResult } from "metabase-types/api";

export const SearchResultSection = ({
  results,
  totalResults,
  searchEngine,
  searchRequestId,
  searchTerm,
  page,
  pageSize,
}: {
  results: ApiSearchResult[];
  totalResults: number;
  searchEngine?: string;
  searchRequestId?: string;
  searchTerm?: string;
  page?: number;
  pageSize?: number;
}) => {
  const resultsLabel = ngettext(
    msgid`${totalResults} result`,
    `${totalResults} results`,
    totalResults,
  );

  return (
    <Paper px="sm" py="md">
      <Stack gap="sm">
        <Text tt="uppercase" fw={700} ml="sm" mb="sm">
          {resultsLabel}
        </Text>
        {results.map((item, index) => {
          const absolutePosition = (page ?? 0) * (pageSize ?? 1) + index;
          return (
            <SearchResult
              key={`${item.id}__${item.model}`}
              result={item}
              index={absolutePosition}
              searchEngine={searchEngine}
              searchRequestId={searchRequestId}
              searchTerm={searchTerm}
            />
          );
        })}
      </Stack>
    </Paper>
  );
};
