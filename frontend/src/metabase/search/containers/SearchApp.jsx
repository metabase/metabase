import { useCallback, useMemo } from "react";
import PropTypes from "prop-types";

import { jt, t } from "ttag";

import _ from "underscore";
import { push } from "react-router-redux";
import Search from "metabase/entities/search";

import EmptyState from "metabase/components/EmptyState";
import { Box, Text, Group, Paper } from "metabase/ui";

import NoResults from "assets/img/no_results.svg";
import PaginationControls from "metabase/components/PaginationControls";
import { usePagination } from "metabase/hooks/use-pagination";
import {
  getFiltersFromLocation,
  getSearchTextFromLocation,
} from "metabase/search/utils";
import { PAGE_SIZE } from "metabase/search/containers/constants";
import { SearchFilterKeys } from "metabase/search/constants";
import { SearchSidebar } from "metabase/search/components/SearchSidebar";
import { useDispatch } from "metabase/lib/redux";
import {
  SearchControls,
  SearchBody,
  SearchMain,
  SearchResultContainer,
} from "metabase/search/containers/SearchApp.styled";
import { SearchResultSection } from "metabase/search/containers/SearchResultSection";

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

  const query = {
    q: searchText,
    ..._.omit(searchFilters, SearchFilterKeys.Type),
    models: searchFilters[SearchFilterKeys.Type] ?? undefined,
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
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
                    illustrationElement={
                      <Box mb={"-2.5rem"}>
                        <img src={NoResults} />
                      </Box>
                    }
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
