/* eslint-disable react/prop-types */
import { useCallback } from "react";
import { push } from "react-router-redux";
import { jt } from "ttag";
import _ from "underscore";
import type { SearchAwareLocation } from "metabase/search/types";
import { usePagination } from "metabase/hooks/use-pagination";
import { useDispatch } from "metabase/lib/redux";
import { SearchFilterKeys } from "metabase/search/constants";
import { PAGE_SIZE } from "metabase/search/containers/constants";
import {
  SearchBody,
  SearchContainer,
  SearchControls,
  SearchHeader,
} from "metabase/search/containers/SearchApp.styled";
import { useLocationSearchElements } from "metabase/search/utils";

export const SearchApp = ({ location }: { location: SearchAwareLocation }) => {
  const dispatch = useDispatch();
  const { searchFilters, searchText } = useLocationSearchElements(location);

  const { handleNextPage, handlePreviousPage, page } = usePagination();

  const onChangeLocation = useCallback(
    nextLocation => dispatch(push(nextLocation)),
    [dispatch],
  );

  const onChangeFilters = useCallback(
    newFilters => {
      onChangeLocation({
        pathname: "search",
        query: { q: searchText.trim(), ...newFilters },
      });
    },
    [onChangeLocation, searchText],
  );

  const query = {
    q: searchText,
    ..._.omit(searchFilters, SearchFilterKeys.Type),
    models: searchFilters[SearchFilterKeys.Type] ?? undefined,
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
  };

  return (
    <SearchContainer h="100%">
      <SearchHeader size="xl" weight={700}>
        {jt`Results for "${searchText}"`}
      </SearchHeader>
      <SearchBody
        query={query}
        onPreviousPage={handlePreviousPage}
        onNextPage={handleNextPage}
        page={page}
      />
      <SearchControls value={searchFilters} onChange={onChangeFilters} />
    </SearchContainer>
  );
};
