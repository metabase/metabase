import _ from "underscore";
import type {
  FilterTypeKeys,
  SearchFilterPropTypes,
  URLSearchFilterQueryParams,
  SearchSidebarFilterComponent,
} from "metabase/search/types";
import { CreatedByFilter } from "metabase/search/components/filters/CreatedByFilter/CreatedByFilter";
import { Stack } from "metabase/ui";
import { SearchFilterKeys } from "metabase/search/constants";
import { SidebarFilter } from "metabase/search/components/SidebarFilter/SidebarFilter";
import { TypeFilter } from "metabase/search/components/filters/TypeFilter/TypeFilter";
import { CreatedAtFilter } from "metabase/search/components/filters/CreatedAtFilter";

type SearchSidebarProps = {
  value: URLSearchFilterQueryParams;
  onChange: (value: URLSearchFilterQueryParams) => void;
};

export const filterMap: Record<FilterTypeKeys, SearchSidebarFilterComponent> = {
  [SearchFilterKeys.Type]: TypeFilter,
  [SearchFilterKeys.CreatedBy]: CreatedByFilter,
  [SearchFilterKeys.CreatedAt]: CreatedAtFilter,
};

export const SearchSidebar = ({ value, onChange }: SearchSidebarProps) => {
  const onOutputChange = (
    key: FilterTypeKeys,
    val: SearchFilterPropTypes[FilterTypeKeys],
  ) => {
    if (!val || (Array.isArray(val) && val.length === 0)) {
      onChange(_.omit(value, key));
    } else {
      const { toUrl } = filterMap[key];
      onChange({
        ...value,
        [key]: toUrl(val),
      });
    }
  };

  const getFilter = (key: FilterTypeKeys) => {
    const Filter = filterMap[key];
    const filterValue = Filter.fromUrl(value[key]);

    return (
      <SidebarFilter
        filter={Filter}
        data-testid={`${key}-search-filter`}
        value={filterValue}
        onChange={value => onOutputChange(key, value)}
      />
    );
  };

  return (
    <Stack py="0.5rem">
      {getFilter(SearchFilterKeys.Type)}
      {getFilter(SearchFilterKeys.CreatedBy)}
      {getFilter(SearchFilterKeys.CreatedAt)}
    </Stack>
  );
};
