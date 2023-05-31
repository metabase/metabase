import React, { useMemo, useCallback } from "react";

import { BooleanPickerCheckbox } from "metabase/query_builder/components/filters/pickers/BooleanPicker";
import { IconName } from "metabase/core/components/Icon";
import Filter from "metabase-lib/queries/structured/Filter";
import Dimension from "metabase-lib/Dimension";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { isBoolean, isString, isNumber } from "metabase-lib/types/utils/isa";

import { BulkFilterSelect } from "../BulkFilterSelect";
import { InlineCategoryPicker } from "../InlineCategoryPicker";
import { InlineValuePicker } from "../InlineValuePicker";
import { InlineDatePicker } from "../InlineDatePicker";
import { InlineOperatorSelector } from "../InlineOperatorSelector";

import { getFieldPickerType } from "./utils";

export interface BulkFilterItemProps {
  query: StructuredQuery;
  filter?: Filter;
  dimension: Dimension;
  isSearch?: boolean;
  onAddFilter: (filter: Filter) => void;
  onChangeFilter: (filter: Filter, newFilter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

export const BulkFilterItem = ({
  query,
  filter,
  dimension,
  isSearch,
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

  const changeOperator = (newOperator: string) => {
    handleChange((filter ?? newFilter).setOperator(newOperator));
  };

  const handleClear = useCallback(() => {
    if (filter) {
      onRemoveFilter(filter);
    }
  }, [filter, onRemoveFilter]);

  const currentOperator = (filter ?? newFilter).operatorName();
  const tableName = useMemo(
    () =>
      (isSearch ? dimension.field()?.table?.displayName() : undefined) ??
      undefined,
    [dimension, isSearch],
  );

  switch (fieldPickerType) {
    case "boolean":
      return (
        <>
          <InlineOperatorSelector
            fieldName={dimension.displayName()}
            iconName="io"
            tableName={tableName}
            value={currentOperator}
            operators={dimension.filterOperators(currentOperator)}
          />
          <BooleanPickerCheckbox
            filter={filter ?? newFilter}
            onFilterChange={handleChange}
          />
        </>
      );
    case "category":
      return (
        <>
          <InlineOperatorSelector
            fieldName={dimension.displayName()}
            value={currentOperator}
            operators={dimension.filterOperators(currentOperator)}
            iconName={(dimension?.icon() as unknown as IconName) ?? undefined}
            tableName={tableName}
            onChange={changeOperator}
          />
          <InlineCategoryPicker
            filter={filter}
            newFilter={newFilter}
            dimension={dimension}
            onChange={handleChange}
          />
        </>
      );
    case "value":
      return (
        <>
          <InlineOperatorSelector
            fieldName={dimension.displayName()}
            iconName={(dimension.icon() as unknown as IconName) ?? undefined}
            tableName={tableName}
            value={currentOperator}
            operators={dimension.filterOperators(currentOperator)}
            onChange={changeOperator}
          />
          <InlineValuePicker
            filter={filter ?? newFilter}
            field={dimension.field()}
            handleChange={handleChange}
          />
        </>
      );
    case "date":
      return (
        <>
          <InlineOperatorSelector
            fieldName={dimension.displayName()}
            iconName={(dimension.icon() as unknown as IconName) ?? undefined}
            tableName={tableName}
          />
          <InlineDatePicker
            query={query}
            filter={filter}
            newFilter={newFilter}
            dimension={dimension}
            onChange={handleChange}
            onClear={handleClear}
          />
        </>
      );
    default:
      return (
        <>
          <InlineOperatorSelector
            fieldName={dimension.displayName()}
            value={currentOperator}
            operators={dimension.filterOperators(currentOperator)}
            iconName={(dimension.icon() as unknown as IconName) ?? undefined}
            tableName={tableName}
            onChange={changeOperator}
          />
          <BulkFilterSelect
            query={query}
            filter={filter}
            dimension={dimension}
            handleChange={handleChange}
            handleClear={handleClear}
          />
        </>
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

  const isNumericField = isNumber(field) && field.has_field_values !== "list";
  if (isNumericField) {
    filter = filter.setOperator("between");
  }

  const isLongTextField =
    isString(field) &&
    field.has_field_values !== "list" &&
    (field.has_field_values === "none" || field.isLongText());

  if (isLongTextField) {
    filter = filter.setOperator("contains");
  }
  return filter;
};
