import React, { useMemo, useCallback } from "react";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Dimension from "metabase-lib/lib/Dimension";
import Field from "metabase-lib/lib/metadata/Field";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { isBoolean } from "metabase/lib/schema_metadata";
import Fields from "metabase/entities/fields";

import { BooleanPickerCheckbox } from "metabase/query_builder/components/filters/pickers/BooleanPicker";
import { BulkFilterSelect } from "../BulkFilterSelect";
import { InlineCategoryPicker } from "../InlineCategoryPicker";
import { SEMANTIC_FIELD_FILTERS, BASE_FIELD_FILTERS } from "./constants";

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

    if (field.has_field_values === "list") {
      return "type/Category";
    }

    if (BASE_FIELD_FILTERS.includes(field.base_type ?? "")) {
      return field.base_type;
    }

    if (SEMANTIC_FIELD_FILTERS.includes(field.semantic_type ?? "")) {
      return field.semantic_type;
    }
  }, [dimension]);

  const newFilter = useMemo(() => getNewFilter(query, dimension), [
    query,
    dimension,
  ]);

  const handleChange = useCallback(
    (newFilter: Filter) => {
      console.log("new", newFilter);
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
      return (
        <InlineCategoryPicker
          query={query}
          filter={filter}
          newFilter={newFilter}
          dimension={dimension}
          handleChange={handleChange}
          handleClear={handleClear}
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
