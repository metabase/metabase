/* eslint-disable @typescript-eslint/no-unused-vars */
import _ from "underscore";
import type {
  FilterTypeKeys,
  SearchFilterPropTypes,
  SearchFilters,
  SearchSidebarFilterComponent,
} from "metabase/search/types";
import { Title, Flex } from "metabase/ui";
import { SearchFilterKeys } from "metabase/search/constants";
import { TypeFilter } from "./filters/type-filter/TypeFilter";
import { SearchSidebarFilter } from "./search-sidebar-filter/SearchSidebarFilter";

const filterMap: Record<FilterTypeKeys, SearchSidebarFilterComponent> = {
  [SearchFilterKeys.Type]: TypeFilter,
};

export const SearchFilterSidebar = ({
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
      <SearchSidebarFilter
        filter={Filter}
        data-testid={`${key}-search-filter`}
        value={normalizedValue}
        onChange={value => onOutputChange(key, value)}
      />
    );
  };

  return <Flex direction="column">{getFilter(SearchFilterKeys.Type)}</Flex>;
};
