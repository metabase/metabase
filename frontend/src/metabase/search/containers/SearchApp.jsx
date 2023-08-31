import { useCallback, useMemo } from "react";
import PropTypes from "prop-types";

import { jt, t } from "ttag";

import _ from "underscore";
import { push } from "react-router-redux";
import Search from "metabase/entities/search";

import Card from "metabase/components/Card";
import EmptyState from "metabase/components/EmptyState";
import Subhead from "metabase/components/type/Subhead";
import { Flex } from "metabase/ui";

import NoResults from "assets/img/no_results.svg";
import PaginationControls from "metabase/components/PaginationControls";
import { usePagination } from "metabase/hooks/use-pagination";
import {
  getFiltersFromLocation,
  getSearchTextFromLocation,
} from "metabase/search/utils";
import { PAGE_SIZE } from "metabase/search/containers/constants";
import { SearchResult } from "metabase/search/components/SearchResult";
import { SearchFilterKeys } from "metabase/search/constants";
import { SearchSidebar } from "metabase/search/components/SearchSidebar/SearchSidebar";
import { useDispatch } from "metabase/lib/redux";
import {
  SearchBody,
  SearchControls,
  SearchHeader,
  SearchMain,
  SearchRoot,
} from "./SearchApp.styled";

export default function SearchApp({ location }) {
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

  const query = useMemo(
    () => ({
      q: searchText,
      ..._.omit(searchFilters, SearchFilterKeys.Type),
      models: searchFilters[SearchFilterKeys.Type] ?? undefined,
      limit: PAGE_SIZE,
      offset: PAGE_SIZE * page,
    }),
    [page, searchFilters, searchText],
  );

  return (
    <SearchRoot data-testid="search-app">
      {searchText && (
        <SearchHeader>
          <Subhead>{jt`Results for "${searchText}"`}</Subhead>
        </SearchHeader>
      )}
      <Search.ListLoader query={query} wrapped>
        {({ list, metadata }) => (
          <SearchBody>
            <SearchMain>
              {list.length > 0 ? (
                <>
                  <SearchResultSection items={list} />
                  <Flex justify="flex-end" align="center" my="1rem">
                    <PaginationControls
                      showTotal
                      pageSize={PAGE_SIZE}
                      page={page}
                      itemsLength={list.length}
                      total={metadata.total}
                      onNextPage={handleNextPage}
                      onPreviousPage={handlePreviousPage}
                    />
                  </Flex>
                </>
              ) : (
                <Card>
                  <EmptyState
                    title={t`Didn't find anything`}
                    message={t`There weren't any results for your search.`}
                    illustrationElement={<img src={NoResults} />}
                  />
                </Card>
              )}
            </SearchMain>
            <SearchControls>
              <SearchSidebar
                value={searchFilters}
                onChangeFilters={onFilterChange}
              />
            </SearchControls>
          </SearchBody>
        )}
      </Search.ListLoader>
    </SearchRoot>
  );
}

SearchApp.propTypes = {
  location: PropTypes.object,
};

const SearchResultSection = ({ items }) => (
  <Card className="pt2">
    {items.map(item => {
      return <SearchResult key={`${item.id}__${item.model}`} result={item} />;
    })}
  </Card>
);

SearchResultSection.propTypes = {
  items: PropTypes.array,
};
