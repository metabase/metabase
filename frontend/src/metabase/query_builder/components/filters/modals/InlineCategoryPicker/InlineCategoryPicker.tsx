import React, { useState, useEffect, useMemo, useCallback } from "react";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Dimension from "metabase-lib/lib/Dimension";
import Field from "metabase-lib/lib/metadata/Field";
import Checkbox from "metabase/core/components/CheckBox";
import { MetabaseApi } from "metabase/services";

import { MAX_INLINE_CATEGORIES } from "./constants";
import { PickerContainer, PickerGrid } from "./InlineCategoryPicker.styled";
import { BulkFilterSelect } from "../BulkFilterSelect";
import { P } from "cljs/goog.dom.tagname";

interface InlineCategoryPickerProps {
  query: StructuredQuery;
  filter?: Filter;
  newFilter: Filter;
  dimension: Dimension;
  handleChange: (newFilter: Filter) => void;
  handleClear: () => void;
}

export function InlineCategoryPicker({
  query,
  filter,
  newFilter,
  handleChange,
  dimension,
  handleClear,
}: InlineCategoryPickerProps) {
  const [fieldValues, setFieldValues] = useState<null | (string | number)[]>(
    null,
  );

  useEffect(() => {
    const field = dimension.field();
    if (field.hasFieldValues()) {
      setFieldValues(field.fieldValues());
      return;
    }
    MetabaseApi.field_values({
      fieldId: field.id,
      limit: MAX_INLINE_CATEGORIES + 1,
    })
      .then(response => {
        setFieldValues(response.values.flat());
      })
      .catch(() => {
        throw new Error("Failed to load field values");
      });
  }, [dimension]);

  if (!fieldValues) {
    return <div>loading</div>;
  }

  if (fieldValues.length <= MAX_INLINE_CATEGORIES) {
    return (
      <SimpleCategoryFilterPicker
        filter={filter ?? newFilter}
        handleChange={handleChange}
        options={fieldValues}
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
