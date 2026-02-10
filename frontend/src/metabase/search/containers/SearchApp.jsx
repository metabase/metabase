import PropTypes from "prop-types";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { jt, t } from "ttag";
import _ from "underscore";

import { useSearchQuery } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { NoObjectError } from "metabase/common/components/errors/NoObjectError";
import { Search } from "metabase/entities/search";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/lib/redux";
import { SearchSidebar } from "metabase/search/components/SearchSidebar";
import {
  SearchContextTypes,
  SearchFilterKeys,
} from "metabase/search/constants";
import {
  SearchBody,
  SearchControls,
  SearchMain,
  SearchResultContainer,
} from "metabase/search/containers/SearchApp.styled";
import { SearchResultSection } from "metabase/search/containers/SearchResultSection";
import { PAGE_SIZE } from "metabase/search/containers/constants";
import {
  getFiltersFromLocation,
  getSearchTextFromLocation,
} from "metabase/search/utils";
import { Box, Group, Paper, Text } from "metabase/ui";

const getPageFromLocation = (location) => {
  const maybePage = location.query?.page
    ? parseInt(location.query.page, 10)
    : 0;
  return maybePage || 0;
};

function SearchApp({ location }) {
  const dispatch = useDispatch();

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

  const query = {
    q: searchText,
    ..._.omit(searchFilters, SearchFilterKeys.Type),
    models: models && (Array.isArray(models) ? models : [models]),
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
    context: SearchContextTypes.SEARCH_APP,
    include_dashboard_questions: true,
  };

  const onChangeLocation = useCallback(
    (nextLocation) => dispatch(push(nextLocation)),
    [dispatch],
  );

  const onFilterChange = useCallback(
    (newFilters) => {
      onChangeLocation({
        pathname: "search",
        query: { q: searchText.trim(), ...newFilters },
      });
    },
    [onChangeLocation, searchText],
  );

  const advancePage = (howMany = 1) => {
    onChangeLocation({
      pathname: "search",
      query: { q: searchText.trim(), ...searchFilters, page: page + howMany },
    });
  };

  const { data, error, isFetching, requestId } = useSearchQuery(query);
  const list = useMemo(() => {
    return data?.data?.map((item) => Search.wrapEntity(item, dispatch)) ?? [];
  }, [data, dispatch]);

  return (
    <SearchMain direction="column" gap="2rem" m="auto" data-testid="search-app">
      <Text size="xl" fw={700}>
        {jt`Results for "${searchText}"`}
      </Text>
      <SearchBody justify="center">
        <SearchControls pb="lg">
          <SearchSidebar value={searchFilters} onChange={onFilterChange} />
        </SearchControls>
        <SearchResultContainer>
          {(error || isFetching) && (
            <LoadingAndErrorWrapper error={error} loading={isFetching} />
          )}

          {!error && !isFetching && list.length === 0 && (
            <Paper shadow="lg" p="2rem">
              <EmptyState
                title={t`Didn't find anything`}
                message={t`There weren't any results for your search.`}
                illustrationElement={<NoObjectError mb="-1.5rem" />}
              />
            </Paper>
          )}

          {!error && !isFetching && list.length > 0 && (
            <Box>
              <SearchResultSection
                totalResults={data.total}
                results={list}
                searchEngine={data.engine}
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
                  total={data.total}
                  onNextPage={() => advancePage(1)}
                  onPreviousPage={() => advancePage(-1)}
                />
              </Group>
            </Box>
          )}
        </SearchResultContainer>
      </SearchBody>
    </SearchMain>
  );
}

SearchApp.propTypes = {
  location: PropTypes.object,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SearchApp;
