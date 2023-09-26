import _ from "underscore";
import { useCallback, useMemo } from "react";
import type {
  FilterTypeKeys,
  SearchFilterComponent,
  SearchFilterPropTypes,
  URLSearchFilterQueryParams,
} from "metabase/search/types";
import { CreatedByFilter } from "metabase/search/components/filters/CreatedByFilter/CreatedByFilter";
import { Stack } from "metabase/ui";
import { SearchFilterKeys } from "metabase/search/constants";
import { TypeFilter } from "metabase/search/components/filters/TypeFilter/TypeFilter";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { ToggleSidebarFilter } from "metabase/search/components/SearchSidebar/ToggleSidebarFilter/ToggleSidebarFilter";
import { CreatedAtFilter } from "metabase/search/components/filters/CreatedAtFilter";
import { DropdownSidebarFilter } from "./DropdownSidebarFilter/DropdownSidebarFilter";

type SearchSidebarProps = {
  value: URLSearchFilterQueryParams;
  onChange: (value: URLSearchFilterQueryParams) => void;
};

export const SearchSidebar = ({ value, onChange }: SearchSidebarProps) => {
  const filterMap: Record<FilterTypeKeys, SearchFilterComponent | null> =
    useMemo(
      () => ({
        [SearchFilterKeys.Type]: TypeFilter,
        [SearchFilterKeys.CreatedBy]: CreatedByFilter,
        [SearchFilterKeys.CreatedAt]: CreatedAtFilter,
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
      onChange(_.omit(value, key));
    } else {
      const filterMapElement = filterMap[key];
      const toUrl = filterMapElement?.toUrl;
      onChange({
        ...value,
        [key]: toUrl?.(val) ?? val,
      });
    }
  };

  const getFilter = (key: FilterTypeKeys) => {
    const Filter = filterMap[key];

    if (!Filter) {
      return null;
    }

    const filterValue = Filter.fromUrl?.(value[key]) ?? value[key];

    if (Filter.type === "toggle") {
      return (
        <ToggleSidebarFilter
          data-testid={`${key}-search-filter`}
          value={filterValue}
          onChange={value => onOutputChange(key, value)}
          filter={Filter}
        />
      );
    } else if (Filter.type === "dropdown") {
      return (
        <DropdownSidebarFilter
          filter={Filter}
          data-testid={`${key}-search-filter`}
          value={filterValue}
          onChange={value => onOutputChange(key, value)}
        />
      );
    }
    return null;
  };

  return (
    <Stack py="0.5rem">
      {getFilter(SearchFilterKeys.Type)}
      {getFilter(SearchFilterKeys.CreatedBy)}
      {getFilter(SearchFilterKeys.CreatedAt)}
      {getFilter(SearchFilterKeys.Verified)}
    </Stack>
  );
};
