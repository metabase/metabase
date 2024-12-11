import PropTypes from "prop-types";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { jt, t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/components/EmptyState";
import { PaginationControls } from "metabase/components/PaginationControls";
import { NoObjectError } from "metabase/components/errors/NoObjectError";
import Search from "metabase/entities/search";
import { usePagination } from "metabase/hooks/use-pagination";
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

function SearchApp({ location }) {
  const dispatch = useDispatch();

  const { handleNextPage, handlePreviousPage, page } = usePagination();

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
    nextLocation => dispatch(push(nextLocation)),
    [dispatch],
  );

  const onFilterChange = useCallback(
    newFilters => {
      onChangeLocation({
        pathname: "search",
        query: { q: searchText.trim(), ...newFilters },
      });
    },
    [onChangeLocation, searchText],
  );

  return (
    <SearchMain
      direction="column"
      gap="2rem"
      p="1.5rem 1rem"
      m="auto"
      data-testid="search-app"
    >
      <Text size="xl" weight={700}>
        {jt`Results for "${searchText}"`}
      </Text>
      <SearchBody direction="column" justify="center">
        <SearchControls pb="lg">
          <SearchSidebar value={searchFilters} onChange={onFilterChange} />
        </SearchControls>
        <SearchResultContainer>
          <Search.ListLoader query={query} wrapped>
            {({ list, metadata }) =>
              list.length === 0 ? (
                <Paper shadow="lg" p="2rem">
                  <EmptyState
                    title={t`Didn't find anything`}
                    message={t`There weren't any results for your search.`}
                    illustrationElement={<NoObjectError mb="-1.5rem" />}
                  />
                </Paper>
              ) : (
                <Box>
                  <SearchResultSection
                    totalResults={metadata.total}
                    results={list}
                  />
                  <Group justify="flex-end" align="center" my="1rem">
                    <PaginationControls
                      showTotal
                      pageSize={PAGE_SIZE}
                      page={page}
                      itemsLength={list.length}
                      total={metadata.total}
                      onNextPage={handleNextPage}
                      onPreviousPage={handlePreviousPage}
                    />
                  </Group>
                </Box>
              )
            }
          </Search.ListLoader>
        </SearchResultContainer>
      </SearchBody>
    </SearchMain>
  );
}

SearchApp.propTypes = {
  location: PropTypes.object,
};

export default SearchApp;
