import { useMemo } from "react";
import { t } from "ttag";
import EmptyState from "metabase/components/EmptyState";
import { useSearchListQuery } from "metabase/common/hooks";
import PaginationControls from "metabase/components/PaginationControls";
import Search from "metabase/entities/search";
import { SearchResultSection } from "metabase/search/containers/SearchResultSection";
import { Stack, Box, Paper, Loader, Text } from "metabase/ui";
import { PAGE_SIZE } from "metabase/search/containers/constants";
import NoResults from "assets/img/no_results.svg";

const SearchEmptyState = () => (
  <Stack>
    <Paper shadow="lg" p="2rem">
      <EmptyState
        title={t`Didn't find anything`}
        message={t`There weren't any results for your search.`}
        illustrationElement={
          <Box mb={"-2.5rem"}>
            <img src={NoResults} />
          </Box>
        }
      />
    </Paper>
  </Stack>
);

export const SearchOutput = ({
  query,
  page,
  onNextPage,
  onPreviousPage,
}: {
  query?: Record<string, unknown>;
  page: number;
  onNextPage: () => void;
  onPreviousPage: () => void;
}) => {
  const {
    data = [],
    isLoading,
    metadata,
  } = useSearchListQuery({
    query,
  });

  const searchResults = useMemo(
    () => data.map(item => Search.wrapEntity(item)),
    [data],
  );

  if (isLoading) {
    return (
      <Stack justify="center" align="center">
        <Loader size="xl" />
        <Text size="lg" color="text.1" weight={600}>{t`Loading…`}</Text>
      </Stack>
    );
  }

  if (searchResults.length === 0) {
    return <SearchEmptyState />;
  }

  return (
    <Stack>
      <SearchResultSection
        items={searchResults}
        totalResults={metadata?.total}
      />
      {metadata && (
        <PaginationControls
          showTotal
          pageSize={PAGE_SIZE}
          page={page}
          itemsLength={searchResults.length}
          total={metadata.total}
          onNextPage={onNextPage}
          onPreviousPage={onPreviousPage}
        />
      )}
    </Stack>
  );
};
