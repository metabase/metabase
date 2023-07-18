import _ from "underscore";
import { useMemo, useState } from "react";
import { LocationDescriptorObject } from "history";
import { FilterType } from "metabase/nav/components/Search/SearchFilterModal/types";
import {
  getSearchTextFromLocation,
  SearchAwareLocation,
  SearchFilterType,
} from "metabase/search/util";

export const useSearchFilters = ({
  location,
  onChangeLocation,
}: {
  location: SearchAwareLocation;
  onChangeLocation: (nextLocation: LocationDescriptorObject) => void;
}) => {
  const [searchText, setSearchText] = useState(
    getSearchTextFromLocation(location),
  );

  const [searchFilters, setSearchFilters] = useState<SearchFilterType>(
    _.pick(location.query, Object.values(FilterType)),
  );

  const applySearchFilters = (filters: SearchFilterType) => {
    setSearchFilters(filters);
    onChangeLocation({
      pathname: "search",
      query: { q: searchText.trim(), ...filters },
    });
  };

  const hasSearchText = searchText.length > 0;

  const hasAppliedSearchFilters = useMemo(() => {
    return Object.keys(location.query || {}).length > 1;
  }, [location.query]);

  return {
    searchText,
    setSearchText,
    searchFilters,
    setSearchFilters,
    hasSearchText,
    applySearchFilters,
    hasAppliedSearchFilters,
  };
};
