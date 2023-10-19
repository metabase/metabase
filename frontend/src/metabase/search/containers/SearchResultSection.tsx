import { t } from "ttag";
import type { WrappedResult } from "metabase/search/types";
import { SearchResult } from "metabase/search/components/SearchResult";
import { Paper, Stack, Text } from "metabase/ui";
import { pluralize } from "metabase/lib/formatting";

export const SearchResultSection = ({
  results,
  totalResults,
}: {
  results: WrappedResult[];
  totalResults: number;
}) => {
  const resultsLabel =
    totalResults === 1
      ? t`1 result`
      : t`${totalResults} ${pluralize("result")}`;
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
