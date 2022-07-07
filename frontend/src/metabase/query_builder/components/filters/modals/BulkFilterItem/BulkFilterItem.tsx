import React, { useMemo, useCallback } from "react";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Dimension from "metabase-lib/lib/Dimension";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { isBoolean, isString, isNumber } from "metabase/lib/schema_metadata";

import { BooleanPickerCheckbox } from "metabase/query_builder/components/filters/pickers/BooleanPicker";
import { BulkFilterSelect } from "../BulkFilterSelect";
import { InlineCategoryPicker } from "../InlineCategoryPicker";
import { InlineValuePicker } from "../InlineValuePicker";
import { InlineDatePicker } from "../InlineDatePicker";

import { getFieldPickerType } from "./utils";

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
  const fieldPickerType = useMemo(
    () => getFieldPickerType(dimension.field()),
    [dimension],
  );

  const newFilter = useMemo(
    () => getNewFilter(query, dimension),
    [query, dimension],
  );

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

  switch (fieldPickerType) {
    case "boolean":
      return (
        <BooleanPickerCheckbox
          filter={filter ?? newFilter}
          onFilterChange={handleChange}
        />
      );
    case "category":
      return (
        <InlineCategoryPicker
          query={query}
          filter={filter}
          newFilter={newFilter}
          dimension={dimension}
          onChange={handleChange}
          onClear={handleClear}
        />
      );
    case "value":
      return (
        <InlineValuePicker
          filter={filter ?? newFilter}
          field={dimension.field()}
          handleChange={handleChange}
        />
      );
    case "date":
      return (
        <InlineDatePicker
          query={query}
          filter={filter}
          newFilter={newFilter}
          dimension={dimension}
          onChange={handleChange}
          onClear={handleClear}
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
  let filter = new Filter([], null, dimension.query() ?? query);
  const field = dimension.field();
  const isBooleanField = isBoolean(field);

  filter = filter.setDimension(dimension.mbql(), {
    useDefaultOperator: !isBooleanField,
  });

  const isNumericField = isNumber(field);
  if (isNumericField) {
    filter = filter.setOperator("between");
  }

  const isTextField = isString(field) && field.has_field_values !== "list";
  if (isTextField) {
    filter = filter.setOperator("contains");
  }
  return filter;
};
