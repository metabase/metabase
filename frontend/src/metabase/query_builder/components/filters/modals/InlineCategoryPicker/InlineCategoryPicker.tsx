import React, { useState, useEffect, useMemo, useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Fields from "metabase/entities/fields";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Dimension from "metabase-lib/lib/Dimension";
import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";

import Warnings from "metabase/query_builder/components/Warnings";
import Checkbox from "metabase/core/components/CheckBox";

import { MAX_INLINE_CATEGORIES } from "./constants";
import {
  PickerContainer,
  PickerGrid,
  Loading,
} from "./InlineCategoryPicker.styled";
import { BulkFilterSelect } from "../BulkFilterSelect";

const mapStateToProps = (state: any, props: any) => {
  const fieldId = props.dimension?.field?.()?.id;
  const fieldValues =
    fieldId != null
      ? Fields.selectors.getFieldValues(state, {
          entityId: fieldId,
        })
      : [];
  return {
    fieldValues: fieldValues || [],
  };
};

const mapDispatchToProps = {
  fetchFieldValues: Fields.actions.fetchFieldValues,
};

interface InlineCategoryPickerProps {
  query: StructuredQuery;
  filter?: Filter;
  newFilter: Filter;
  dimension: Dimension;
  fieldValues: any[];
  fetchFieldValues: ({ id }: { id: number }) => Promise<any>;
  handleChange: (newFilter: Filter) => void;
  handleClear: () => void;
}

function InlineCategoryPickerComponent({
  query,
  filter,
  newFilter,
  handleChange,
  fieldValues,
  fetchFieldValues,
  dimension,
  handleClear,
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

  if (fieldValues.length <= MAX_INLINE_CATEGORIES) {
    return (
      <SimpleCategoryFilterPicker
        filter={filter ?? newFilter}
        handleChange={handleChange}
        options={fieldValues.flat()}
      />
    );
  }

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

interface SimpleCategoryFilterPickerProps {
  filter: Filter;
  options: (string | number)[];
  handleChange: (newFilter: Filter) => void;
}

export function SimpleCategoryFilterPicker({
  filter,
  options,
  handleChange,
}: SimpleCategoryFilterPickerProps) {
  const filterValues = useMemo(() => filter.arguments().filter(Boolean), [
    filter,
  ]);

  const onChange = useCallback(
    (option, checked) => {
      const newArgs = checked
        ? [...filterValues, option]
        : filterValues.filter(o => o !== option);

      console.log("newArgs", newArgs);

      handleChange(filter.setArguments(newArgs));
    },
    [filterValues, handleChange, filter],
  );

  return (
    <PickerContainer>
      <PickerGrid>
        {options.map((option: string | number) => (
          <Checkbox
            key={option.toString()}
            checked={filterValues.includes(option)}
            onChange={e => onChange(option, e.target.checked)}
            checkedColor="accent2"
            label={option.toString()}
          />
        ))}
      </PickerGrid>
    </PickerContainer>
  );
}

export const InlineCategoryPicker = connect(
  mapStateToProps,
  mapDispatchToProps,
)(InlineCategoryPickerComponent);
