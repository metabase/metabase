import React, { useState, useEffect } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Fields from "metabase/entities/fields";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Dimension from "metabase-lib/lib/Dimension";
import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";

import Warnings from "metabase/query_builder/components/Warnings";
import Checkbox from "metabase/core/components/CheckBox";

import { BulkFilterSelect } from "../BulkFilterSelect";
import { InlineValuePicker } from "../InlineValuePicker";

import { MAX_INLINE_CATEGORIES } from "./constants";
import {
  PickerContainer,
  PickerGrid,
  Loading,
} from "./InlineCategoryPicker.styled";

const mapStateToProps = (state: any, props: any) => {
  const fieldId = props.dimension?.field?.()?.id;

  if (props.dimension?.field?.()?.values?.length) {
    return { fieldValues: props.dimension?.field?.()?.values };
  }

  const fieldValues =
    fieldId != null
      ? Fields.selectors.getFieldValues(state, {
          entityId: fieldId,
        })
      : [];
  return { fieldValues };
};

const mapDispatchToProps = {
  fetchFieldValues: Fields.actions.fetchFieldValues,
};

interface InlineCategoryPickerProps {
  query: StructuredQuery;
  filter?: Filter;
  tableName?: string;
  newFilter: Filter;
  dimension: Dimension;
  fieldValues: any[];
  fetchFieldValues: ({ id }: { id: number }) => Promise<any>;
  onChange: (newFilter: Filter) => void;
  onClear: () => void;
}

export function InlineCategoryPickerComponent({
  query,
  filter,
  newFilter,
  dimension,
  fieldValues,
  fetchFieldValues,
  onChange,
  onClear,
}: InlineCategoryPickerProps) {
  const safeFetchFieldValues = useSafeAsyncFunction(fetchFieldValues);
  const shouldFetchFieldValues = !dimension?.field()?.hasFieldValues();
  const [isLoading, setIsLoading] = useState(shouldFetchFieldValues);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!shouldFetchFieldValues) {
      setIsLoading(false);
      return;
    }
    const field = dimension.field();
    safeFetchFieldValues({ id: field.id })
      .then(() => {
        setIsLoading(false);
      })
      .catch(() => {
        setHasError(true);
      });
  }, [dimension, safeFetchFieldValues, shouldFetchFieldValues]);

  const hasCheckboxOperator =
    !filter || ["=", "!="].includes(filter?.operatorName());

  const hasValidOptions = fieldValues.flat().find(isValidOption);

  const showInlinePicker =
    hasValidOptions &&
    fieldValues.length <= MAX_INLINE_CATEGORIES &&
    hasCheckboxOperator;

  const showPopoverPicker = !showInlinePicker && hasCheckboxOperator;

  if (hasError) {
    return (
      <Warnings
        warnings={[
          t`There was an error loading the field values for this field`,
        ]}
      />
    );
  }

  if (isLoading) {
    return <Loading size={20} />;
  }

  if (showInlinePicker) {
    return (
      <SimpleCategoryFilterPicker
        filter={filter ?? newFilter}
        onChange={onChange}
        options={fieldValues.flat().filter(isValidOption)}
      />
    );
  }

  if (showPopoverPicker) {
    return (
      <BulkFilterSelect
        query={query}
        filter={filter}
        dimension={dimension}
        handleChange={onChange}
        handleClear={onClear}
      />
    );
  }

  return (
    <InlineValuePicker
      filter={filter ?? newFilter}
      field={dimension.field()}
      handleChange={onChange}
    />
  );
}

interface SimpleCategoryFilterPickerProps {
  filter: Filter;
  options: (string | number)[];
  onChange: (newFilter: Filter) => void;
}

export function SimpleCategoryFilterPicker({
  filter,
  options,
  onChange,
}: SimpleCategoryFilterPickerProps) {
  const filterValues = filter.arguments().filter(isValidOption);

  const handleChange = (option: string | number, checked: boolean) => {
    const newArgs = checked
      ? [...filterValues, option]
      : filterValues.filter(filterValue => filterValue !== option);

    onChange(filter.setArguments(newArgs));
  };

  return (
    <PickerContainer data-testid="category-picker">
      <PickerGrid>
        {options.map((option: string | number) => (
          <Checkbox
            key={option?.toString() ?? "empty"}
            checked={filterValues.includes(option)}
            onChange={e => handleChange(option, e.target.checked)}
            label={option?.toString() ?? t`empty`}
          />
        ))}
      </PickerGrid>
    </PickerContainer>
  );
}

const isValidOption = (option: any) => option !== undefined && option !== null;

export const InlineCategoryPicker = connect(
  mapStateToProps,
  mapDispatchToProps,
)(InlineCategoryPickerComponent);
