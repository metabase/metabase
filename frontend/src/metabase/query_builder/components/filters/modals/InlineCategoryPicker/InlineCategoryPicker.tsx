import { useState, useEffect } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Fields from "metabase/entities/fields";
import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";
import Warnings from "metabase/query_builder/components/Warnings";
import type Filter from "metabase-lib/queries/structured/Filter";
import Dimension from "metabase-lib/Dimension";

import { InlineValuePicker } from "../InlineValuePicker";

import { MAX_INLINE_CATEGORIES } from "./constants";
import { isValidOption } from "./utils";

import { SimpleCategoryFilterPicker } from "./SimpleCategoryFilterPicker";

import { Loading } from "./InlineCategoryPicker.styled";

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
  filter?: Filter;
  tableName?: string;
  newFilter: Filter;
  dimension: Dimension;
  fieldValues: any[];
  fetchFieldValues: ({ id }: { id: number }) => Promise<any>;
  onChange: (newFilter: Filter) => void;
}

export function InlineCategoryPickerComponent({
  filter,
  newFilter,
  dimension,
  fieldValues,
  fetchFieldValues,
  onChange,
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

  const hasCheckboxOperator = ["=", "!="].includes(
    (filter ?? newFilter)?.operatorName(),
  );

  const hasValidOptions = fieldValues.flat().find(isValidOption);

  const showInlinePicker =
    hasValidOptions &&
    fieldValues.length <= MAX_INLINE_CATEGORIES &&
    hasCheckboxOperator;

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
        options={fieldValues.filter(([value]) => isValidOption(value))}
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

export const InlineCategoryPicker = connect(
  mapStateToProps,
  mapDispatchToProps,
)(InlineCategoryPickerComponent);
