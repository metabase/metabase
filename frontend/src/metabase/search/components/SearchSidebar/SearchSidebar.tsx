/* eslint-disable @typescript-eslint/no-unused-vars */
import _ from "underscore";
import { useCallback, useMemo } from "react";
import type {
  FilterTypeKeys,
  SearchFilterComponent,
  SearchFilterPropTypes,
  SearchFilters,
} from "metabase/search/types";
import { Stack } from "metabase/ui";
import { SearchFilterKeys } from "metabase/search/constants";
import { DropdownSidebarFilter } from "metabase/search/components/SearchSidebar/DropdownSidebarFilter/DropdownSidebarFilter";
import { TypeFilter } from "metabase/search/components/filters/TypeFilter/TypeFilter";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { ToggleSidebarFilter } from "metabase/search/components/SearchSidebar/ToggleSidebarFilter/ToggleSidebarFilter";

export const SearchSidebar = ({
  value,
  onChangeFilters,
}: {
  value: SearchFilters;
  onChangeFilters: (filters: SearchFilters) => void;
}) => {
  const filterMap: Record<FilterTypeKeys, SearchFilterComponent | null> =
    useMemo(
      () => ({
        [SearchFilterKeys.Type]: TypeFilter,
        [SearchFilterKeys.Verified]: PLUGIN_CONTENT_VERIFICATION.VerifiedFilter,
      }),
      [],
    );

  const isValidFilterValue = useCallback(
    (
      key: FilterTypeKeys,
      val: SearchFilterPropTypes[FilterTypeKeys],
    ): boolean => {
      if (!val || !filterMap[key]) {
        return false;
      }

      if (Array.isArray(val)) {
        return val.length > 0;
      }
      return true;
    },
    [filterMap],
  );

  const onOutputChange = (
    key: FilterTypeKeys,
    val: SearchFilterPropTypes[FilterTypeKeys],
  ) => {
    if (!isValidFilterValue(key, val)) {
      onChangeFilters(_.omit(value, key));
    } else {
      onChangeFilters({
        ...value,
        [key]: val,
      });
    }
  };

  const getFilter = (key: FilterTypeKeys) => {
    const Filter = filterMap[key];
    if (!Filter) {
      return null;
    }

    if (Filter.type === "toggle") {
      return (
        <ToggleSidebarFilter
          data-testid={`${key}-search-filter`}
          value={value[key]}
          onChange={value => onOutputChange(key, value)}
          filter={Filter}
        />
      );
    } else if (Filter.type === "dropdown") {
      const normalizedValue =
        Array.isArray(value[key]) || !value[key] ? value[key] : [value[key]];
      return (
        <DropdownSidebarFilter
          filter={Filter}
          data-testid={`${key}-search-filter`}
          value={normalizedValue}
          onChange={value => onOutputChange(key, value)}
        />
      );
    }

    return null;
  };

  return (
    <Stack spacing="sm" mb="2rem">
      {getFilter(SearchFilterKeys.Type)}
      {getFilter(SearchFilterKeys.Verified)}
    </Stack>
  );
};
