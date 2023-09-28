import _ from "underscore";
import type {
  FilterTypeKeys,
  SearchFilterComponent,
  SearchQueryParamValue,
  URLSearchFilterQueryParams,
} from "metabase/search/types";
import { CreatedByFilter } from "metabase/search/components/filters/CreatedByFilter/CreatedByFilter";
import { Stack } from "metabase/ui";
import { SearchFilterKeys } from "metabase/search/constants";
import { TypeFilter } from "metabase/search/components/filters/TypeFilter";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { ToggleSidebarFilter } from "metabase/search/components/SearchSidebar/ToggleSidebarFilter/ToggleSidebarFilter";
import { CreatedAtFilter } from "metabase/search/components/filters/CreatedAtFilter";
import { DropdownSidebarFilter } from "./DropdownSidebarFilter/DropdownSidebarFilter";

type SearchSidebarProps = {
  value: URLSearchFilterQueryParams;
  onChange: (value: URLSearchFilterQueryParams) => void;
};

export const SearchSidebar = ({ value, onChange }: SearchSidebarProps) => {
  const filterMap: Record<FilterTypeKeys, SearchFilterComponent> = {
    [SearchFilterKeys.Type]: TypeFilter,
    [SearchFilterKeys.CreatedBy]: CreatedByFilter,
    [SearchFilterKeys.CreatedAt]: CreatedAtFilter,
    [SearchFilterKeys.Verified]: PLUGIN_CONTENT_VERIFICATION.VerifiedFilter,
  };

  const onOutputChange = (key: FilterTypeKeys, val: SearchQueryParamValue) => {
    if (!val) {
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
    const Filter: SearchFilterComponent = filterMap[key];

    const filterValue = Filter.fromUrl?.(value[key]) ?? value[key];

    if (Filter.type === "toggle") {
      return (
        <ToggleSidebarFilter
          data-testid={`${key}-search-filter`}
          value={filterValue}
          onChange={value => onOutputChange(key, Filter.toUrl(value))}
          filter={Filter}
        />
      );
    } else if (Filter.type === "dropdown") {
      return (
        <DropdownSidebarFilter
          filter={Filter}
          data-testid={`${key}-search-filter`}
          value={filterValue}
          onChange={value => onOutputChange(key, Filter.toUrl(value))}
        />
      );
    }
    return null;
  };

  return (
    <Stack>
      {getFilter(SearchFilterKeys.Type)}
      {getFilter(SearchFilterKeys.CreatedBy)}
      {getFilter(SearchFilterKeys.CreatedAt)}
      {getFilter(SearchFilterKeys.Verified)}
    </Stack>
  );
};
