import { msgid, ngettext } from "ttag";

import { SearchResult } from "metabase/search/components/SearchResult";
import type { WrappedResult } from "metabase/search/types";
import { Paper, Stack, Text } from "metabase/ui";

export const SearchResultSection = ({
  results,
  totalResults,
}: {
  results: WrappedResult[];
  totalResults: number;
}) => {
  const resultsLabel = ngettext(
    msgid`${totalResults} result`,
    `${totalResults} results`,
    totalResults,
  );

  return (
    <Paper px="sm" py="md">
      <Stack spacing="sm">
        <Text tt="uppercase" fw={700} ml="sm" mb="sm">
          {resultsLabel}
        </Text>
        {results.map((item, index) => {
          return (
            <SearchResult
              key={`${item.id}__${item.model}`}
              result={item}
              index={index}
            />
          );
        })}
      </Stack>
    </Paper>
  );
};
