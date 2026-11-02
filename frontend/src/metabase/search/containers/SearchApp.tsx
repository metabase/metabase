import { useCallback, useMemo } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import { useSearchQuery } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import {
  LoadingSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import { NoObjectError } from "metabase/common/components/errors/NoObjectError";
import {
  filterEnabledSearchTypes,
  getFiltersFromLocation,
  getSearchTextFromLocation,
} from "metabase/common/search";
import {
  SearchContextTypes,
  SearchFilterKeys,
} from "metabase/common/search/constants";
import type { URLSearchFilterQueryParams } from "metabase/common/search/types";
import { usePageTitle } from "metabase/hooks/use-page-title";
import type { Location, To } from "metabase/router";
import { queryToSearch, useLocation, useNavigate } from "metabase/router";
import { SearchSidebar } from "metabase/search/components/SearchSidebar";
import { SearchResultSection } from "metabase/search/containers/SearchResultSection";
import { PAGE_SIZE } from "metabase/search/containers/constants";
import {
  Box,
  Flex,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  rem,
} from "metabase/ui";
import type { SearchRequest } from "metabase-types/api";

import S from "./SearchApp.module.css";

const SEARCH_RESULTS_SKELETON_ROWS = 8;

const getPageFromLocation = (location: Location) => {
  const page = new URLSearchParams(location.search).get("page");
  const maybePage = page ? parseInt(page, 10) : 0;
  return maybePage || 0;
};

export function SearchApp() {
  const location = useLocation();
  const navigate = useNavigate();

  usePageTitle(t`Search`);

  const page = getPageFromLocation(location);

  const searchText = useMemo(
    () => getSearchTextFromLocation(location),
    [location],
  );

  const searchFilters = useMemo(
    () => getFiltersFromLocation(location),
    [location],
  );
  const models = searchFilters[SearchFilterKeys.Type];

  // Unjustified type cast. FIXME
  const query = {
    q: searchText,
    ..._.omit(searchFilters, SearchFilterKeys.Type),
    models: !models
      ? undefined
      : filterEnabledSearchTypes(Array.isArray(models) ? models : [models]),
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
    context: SearchContextTypes.SEARCH_APP,
    include_dashboard_questions: true,
  } as SearchRequest;

  const onChangeLocation = useCallback(
    (nextLocation: To) => navigate(nextLocation),
    [navigate],
  );

  const onFilterChange = useCallback(
    (newFilters: URLSearchFilterQueryParams) => {
      onChangeLocation({
        pathname: "/search",
        search: queryToSearch({ q: searchText.trim(), ...newFilters }),
      });
    },
    [onChangeLocation, searchText],
  );

  const advancePage = (howMany = 1) => {
    onChangeLocation({
      pathname: "/search",
      search: queryToSearch({
        q: searchText.trim(),
        ...searchFilters,
        page: String(page + howMany),
      }),
    });
  };

  // `currentData` is only for the current query, so a new search or page
  // doesn't show the previous one's results while it loads.
  const {
    currentData: data,
    error,
    isFetching,
    requestId,
  } = useSearchQuery(query);
  const list = useMemo(() => data?.data ?? [], [data?.data]);
  const isLoading = isFetching && !data;

  return (
    <Flex className={S.main} data-testid="search-app">
      <Text size="xl" fw={700}>
        {jt`Results for "${searchText}"`}
      </Text>
      <Flex className={S.body}>
        <Stack className={S.controls}>
          <SearchSidebar value={searchFilters} onChange={onFilterChange} />
        </Stack>
        <Box flex={1}>
          {!!error && <LoadingAndErrorWrapper error={error} />}

          {!error && isLoading && <SearchResultSectionSkeleton />}

          {!error && !isLoading && list.length === 0 && (
            <Paper shadow="lg" p="2rem">
              <EmptyState
                title={t`Didn't find anything`}
                message={t`There weren't any results for your search.`}
                illustrationElement={<NoObjectError mb="-1.5rem" />}
              />
            </Paper>
          )}

          {!error && !isLoading && list.length > 0 && (
            <Box>
              <SearchResultSection
                totalResults={data?.total ?? 0}
                results={list}
                searchEngine={data?.engine}
                searchRequestId={requestId}
                searchTerm={searchText}
                page={page}
                pageSize={PAGE_SIZE}
              />
              <Group justify="flex-end" align="center" my="1rem">
                <PaginationControls
                  showTotal
                  pageSize={PAGE_SIZE}
                  page={page}
                  itemsLength={list.length}
                  total={data?.total ?? 0}
                  onNextPage={() => advancePage(1)}
                  onPreviousPage={() => advancePage(-1)}
                />
              </Group>
            </Box>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}

const SearchResultSectionSkeleton = () => (
  <Paper px="sm" py="lg">
    <LoadingSkeleton gap="sm">
      <Skeleton h={12} w={80} ml="sm" mb="sm" radius="xs" />
      {Array.from({ length: SEARCH_RESULTS_SKELETON_ROWS }, (_, index) => (
        <Flex key={index} align="flex-start" gap="0.75rem" p="sm">
          <Skeleton h={rem(32)} w={rem(32)} radius="xs" flex="none" />
          <Stack gap="sm" flex={1} pt="xs">
            <Skeleton h={14} w={getSkeletonLineWidth(index)} radius="xs" />
            <Skeleton h={10} w={getSkeletonLineWidth(index + 3)} radius="xs" />
          </Stack>
        </Flex>
      ))}
    </LoadingSkeleton>
  </Paper>
);
