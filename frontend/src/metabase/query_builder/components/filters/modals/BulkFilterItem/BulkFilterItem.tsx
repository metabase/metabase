import React, { useMemo, useCallback } from "react";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Dimension from "metabase-lib/lib/Dimension";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { isBoolean } from "metabase/lib/schema_metadata";

import { BooleanPickerCheckbox } from "metabase/query_builder/components/filters/pickers/BooleanPicker";
import { BulkFilterSelect } from "../BulkFilterSelect";

export interface BulkFilterItemProps {
  query: StructuredQuery;
  filter?: Filter;
  dimension: Dimension;
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

export const BulkFilterItem = ({
  query,
  filter,
  dimension,
  onAddFilter,
  onChangeFilter,
  onRemoveFilter,
}: BulkFilterItemProps): JSX.Element => {
  const fieldType = useMemo(() => dimension.field().base_type ?? "", [
    dimension,
  ]);

  const newFilter = useMemo(() => getNewFilter(query, dimension), [
    query,
    dimension,
  ]);

  const handleChange = useCallback(
    (newFilter: Filter) => {
      filter ? onChangeFilter(filter, newFilter) : onAddFilter(newFilter);
    },
    [filter, onAddFilter, onChangeFilter],
  );

  const handleClear = useCallback(() => {
    if (filter) {
      onRemoveFilter(filter);
    }
  }, [filter, onRemoveFilter]);

  switch (fieldType) {
    case "type/Boolean":
      return (
        <BooleanPickerCheckbox
          filter={filter ?? newFilter}
          onFilterChange={handleChange}
        />
      );
    default:
      return (
        <BulkFilterSelect
          query={query}
          filter={filter}
          dimension={dimension}
          handleChange={handleChange}
          handleClear={handleClear}
        />
      );
  }
};

const getNewFilter = (query: StructuredQuery, dimension: Dimension): Filter => {
  const filter = new Filter([], null, dimension.query() ?? query);
  const isBooleanField = isBoolean(dimension.field());

  return filter.setDimension(dimension.mbql(), {
    useDefaultOperator: !isBooleanField,
  });
};
