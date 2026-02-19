import _ from "underscore";

import { useShowOtherUsersCollections } from "metabase/common/hooks/use-show-other-users-collections";
import { PLUGIN_CONTENT_VERIFICATION } from "metabase/plugins";
import { DropdownSidebarFilter } from "metabase/search/components/DropdownSidebarFilter";
import { ToggleSidebarFilter } from "metabase/search/components/ToggleSidebarFilter";
import { CreatedAtFilter } from "metabase/search/components/filters/CreatedAtFilter";
import { CreatedByFilter } from "metabase/search/components/filters/CreatedByFilter";
import { LastEditedAtFilter } from "metabase/search/components/filters/LastEditedAtFilter";
import { LastEditedByFilter } from "metabase/search/components/filters/LastEditedByFilter";
import { NativeQueryFilter } from "metabase/search/components/filters/NativeQueryFilter";
import { PersonalCollectionsFilter } from "metabase/search/components/filters/PersonalCollectionsFilter";
import { SearchTrashedItemsFilter } from "metabase/search/components/filters/SearchTrashedItemsFilter";
import { TypeFilter } from "metabase/search/components/filters/TypeFilter";
import { SearchFilterKeys } from "metabase/search/constants";
import type {
  FilterTypeKeys,
  SearchFilterComponent,
  SearchQueryParamValue,
  URLSearchFilterQueryParams,
} from "metabase/search/types";
import { Stack } from "metabase/ui";

type SearchSidebarProps = {
  value: URLSearchFilterQueryParams;
  onChange: (value: URLSearchFilterQueryParams) => void;
};

export const SearchSidebar = ({ value, onChange }: SearchSidebarProps) => {
  const filterMap: Record<FilterTypeKeys, SearchFilterComponent> = {
    [SearchFilterKeys.Type]: TypeFilter,
    [SearchFilterKeys.CreatedBy]: CreatedByFilter,
    [SearchFilterKeys.CreatedAt]: CreatedAtFilter,
    [SearchFilterKeys.LastEditedBy]: LastEditedByFilter,
    [SearchFilterKeys.LastEditedAt]: LastEditedAtFilter,
    [SearchFilterKeys.Verified]: PLUGIN_CONTENT_VERIFICATION.VerifiedFilter,
    [SearchFilterKeys.NativeQuery]: NativeQueryFilter,
    [SearchFilterKeys.SearchTrashedItems]: SearchTrashedItemsFilter,
    [SearchFilterKeys.PersonalCollections]: PersonalCollectionsFilter,
  };

  const onOutputChange = (key: FilterTypeKeys, val?: SearchQueryParamValue) => {
    if (!val) {
      onChange(_.omit(value, key));
    } else {
      onChange({
        ...value,
        [key]: val,
      });
    }
  };

  const getFilter = (key: FilterTypeKeys) => {
    const Filter: SearchFilterComponent = filterMap[key];

    if (!Filter.type) {
      return null;
    }

    const filterValue = Filter.fromUrl(value[key]);

    if (Filter.type === "toggle") {
      return (
        <ToggleSidebarFilter
          filter={Filter}
          value={filterValue}
          data-testid={`${key}-search-filter`}
          onChange={(value) => onOutputChange(key, Filter.toUrl(value))}
        />
      );
    } else if (Filter.type === "dropdown") {
      return (
        <DropdownSidebarFilter
          filter={Filter}
          data-testid={`${key}-search-filter`}
          value={filterValue}
          onChange={(value) => onOutputChange(key, Filter.toUrl(value))}
        />
      );
    }
    return null;
  };

  const showOtherUsersCollections = useShowOtherUsersCollections();

  return (
    <Stack gap="lg">
      {getFilter(SearchFilterKeys.Type)}
      <Stack gap="sm">
        {getFilter(SearchFilterKeys.CreatedBy)}
        {getFilter(SearchFilterKeys.LastEditedBy)}
      </Stack>
      <Stack gap="sm">
        {getFilter(SearchFilterKeys.CreatedAt)}
        {getFilter(SearchFilterKeys.LastEditedAt)}
      </Stack>
      {getFilter(SearchFilterKeys.Verified)}
      {getFilter(SearchFilterKeys.NativeQuery)}
      {getFilter(SearchFilterKeys.SearchTrashedItems)}
      {showOtherUsersCollections &&
        getFilter(SearchFilterKeys.PersonalCollections)}
    </Stack>
  );
};
