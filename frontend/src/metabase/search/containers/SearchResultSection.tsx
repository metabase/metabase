import { msgid, ngettext } from "ttag";
import type { WrappedResult } from "metabase/search/types";
import { SearchResult } from "metabase/search/components/SearchResult";
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
        {results.map(item => {
          return (
            <SearchResult key={`${item.id}__${item.model}`} result={item} />
          );
        })}
      </Stack>
    </Paper>
  );
};
