import React, { useMemo, useCallback } from "react";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Dimension from "metabase-lib/lib/Dimension";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { isBoolean, isString } from "metabase/lib/schema_metadata";

import { BooleanPickerCheckbox } from "metabase/query_builder/components/filters/pickers/BooleanPicker";
import { BulkFilterSelect } from "../BulkFilterSelect";
import { InlineCategoryPicker } from "../InlineCategoryPicker";
import { InlineValuePicker } from "../InlineValuePicker";

import { FIELD_TYPE_PRIORITY } from "./constants";

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
  const fieldType = useMemo(() => {
    const field = dimension.field();

    const relevantFieldType = FIELD_TYPE_PRIORITY.find(t =>
      [field.semantic_type, field.base_type, field.has_field_values].includes(
        t,
      ),
    );

    if (relevantFieldType) {
      return relevantFieldType;
    }
  }, [dimension]);

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
    case "type/Category":
    case "list":
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
    case "type/PK":
    case "type/FK":
    case "type/Text":
      return (
        <InlineValuePicker
          filter={filter ?? newFilter}
          field={dimension.field()}
          handleChange={handleChange}
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
  const isTextField = isString(field) && field.has_field_values !== "list";

  filter = filter.setDimension(dimension.mbql(), {
    useDefaultOperator: !isBooleanField,
  });

  if (isTextField) {
    filter = filter.setOperator("contains");
  }
  return filter;
};
