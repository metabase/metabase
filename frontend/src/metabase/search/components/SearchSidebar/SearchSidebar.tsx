/* eslint-disable @typescript-eslint/no-unused-vars */
import _ from "underscore";
import type {
  FilterTypeKeys,
  SearchFilterPropTypes,
  SearchFilters,
  SearchSidebarFilterComponent,
} from "metabase/search/types";
import {Title, Flex, Stack} from "metabase/ui";
import {SearchFilterKeys} from "metabase/search/constants";
import {SidebarFilter} from "metabase/search/components/SidebarFilter/SidebarFilter";
import {TypeFilter} from "metabase/search/components/filters/TypeFilter/TypeFilter";
import {CreatedAtFilter} from "metabase/search/components/filters/CreatedAtFilter";

export const filterMap: Record<FilterTypeKeys, SearchSidebarFilterComponent> = {
  [SearchFilterKeys.Type]: TypeFilter,
  [SearchFilterKeys.CreatedAt]: CreatedAtFilter,
};

export const SearchSidebar = ({
                                value,
                                onChangeFilters,
                              }: {
  value: SearchFilters;
  onChangeFilters: (filters: SearchFilters) => void;
}) => {
  const onOutputChange = (
    key: FilterTypeKeys,
    val: SearchFilterPropTypes[FilterTypeKeys],
  ) => {
    if (!val || val.length === 0) {
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
    const normalizedValue =
      Array.isArray(value[key]) || !value[key] ? value[key] : [value[key]];
    return (
      <SidebarFilter
        filter={Filter}
        data-testid={`${key}-search-filter`}
        value={normalizedValue}
        onChange={value => onOutputChange(key, value)}
      />
    );
  };

  return <Stack>
    {getFilter(SearchFilterKeys.Type)}
    {getFilter(SearchFilterKeys.CreatedAt)}
  </Stack>;
};
