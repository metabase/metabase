import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";

import { jt, t } from "ttag";

import _ from "underscore";
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
import { TypeSearchSidebar } from "metabase/search/components/TypeSearchSidebar";
import { PAGE_SIZE } from "metabase/search/containers/constants";
import { SearchResult } from "metabase/search/components/SearchResult";
import { SearchFilterKeys } from "metabase/search/constants";
import {
  SearchBody,
  SearchControls,
  SearchEmptyState,
  SearchHeader,
  SearchMain,
  SearchRoot,
} from "./SearchApp.styled";

export default function SearchApp({ location }) {
  const { handleNextPage, handlePreviousPage, setPage, page } = usePagination();

  const searchText = useMemo(
    () => getSearchTextFromLocation(location),
    [location],
  );

  const searchFilters = useMemo(() => {
    return getFiltersFromLocation(location);
  }, [location]);

  const [selectedSidebarType, setSelectedSidebarType] = useState(null);

  useEffect(() => {
    if (location.search) {
      setSelectedSidebarType(null);
    }
  }, [location.search]);

  const query = {
    q: searchText,
    ..._.omit(searchFilters, SearchFilterKeys.Type),
    models: selectedSidebarType ?? searchFilters[SearchFilterKeys.Type],
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
  };

  const onChangeSelectedType = filter => {
    setSelectedSidebarType(filter);
    setPage(0);
  };

  const getAvailableModels = availableModels => {
    const models = availableModels || [];
    return models.filter(
      filter => !searchFilters?.type || searchFilters.type.includes(filter),
    );
  };

  return (
    <SearchRoot data-testid="search-app">
      {searchText && (
        <SearchHeader>
          <Subhead>{jt`Results for "${searchText}"`}</Subhead>
        </SearchHeader>
      )}
      <Search.ListLoader query={query} wrapped>
        {({ list, metadata }) =>
          list.length > 0 ? (
            <SearchBody>
              <SearchMain>
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
              </SearchMain>
              <SearchControls>
                
              </SearchControls>
            </SearchBody>
          ) : (
            <SearchEmptyState>
              <Card>
                <EmptyState
                  title={t`Didn't find anything`}
                  message={t`There weren't any results for your search.`}
                  illustrationElement={<img src={NoResults} />}
                />
              </Card>
            </SearchEmptyState>
          )
        }
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
