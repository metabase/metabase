import _ from "underscore";
import { useMemo } from "react";
import {
  FilterTypeKeys,
  SearchFilterComponent,
  SearchFilterPropTypes,
  SearchFilters,
} from "metabase/search/types";
import { SearchFilterKeys } from "metabase/search/constants";
import {
  CreatedAtFilter,
  CreatedByFilter,
  TypeFilter,
} from "metabase/search/components/SearchFilterModal/filters";
import { Group } from "metabase/ui";
import { SearchFilterView } from "../SearchFilterModal/filters/SearchFilterView";

const filterMap: Record<FilterTypeKeys, SearchFilterComponent> = {
  [SearchFilterKeys.Type]: TypeFilter,
  [SearchFilterKeys.CreatedBy]: CreatedByFilter,
  [SearchFilterKeys.CreatedAt]: CreatedAtFilter,
};
export const SearchFilterDisplay = ({
  onChangeFilters,
  value,
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
  // we can use this field to control which filters are available
  // - we can enable the 'verified' filter here
  const availableFilters: FilterTypeKeys[] = useMemo(() => {
    return [
      SearchFilterKeys.Type,
      SearchFilterKeys.CreatedBy,
      SearchFilterKeys.CreatedAt,
    ];
  }, []);

  const getFilterComponent = (key: FilterTypeKeys) => {
    const FilterComponent = filterMap[key];
    if (!availableFilters.includes(key) || !FilterComponent) {
      return null;
    }
    return (
      <FilterComponent
        data-testid={`${key}-search-filter`}
        value={value[key]}
        onChange={val => onOutputChange(key, val)}
      />
    );
  };

  return (
    <>
      {getFilterComponent(SearchFilterKeys.Type)}
      <SearchFilterView title="Created by" align="center">
        <Group grow>
          {getFilterComponent(SearchFilterKeys.CreatedBy)}
          {getFilterComponent(SearchFilterKeys.CreatedAt)}
        </Group>
      </SearchFilterView>
    </>
  );
};
