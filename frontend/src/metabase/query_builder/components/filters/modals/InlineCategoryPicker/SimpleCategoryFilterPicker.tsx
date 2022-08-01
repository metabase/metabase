import React from "react";
import { t } from "ttag";
import Checkbox from "metabase/core/components/CheckBox";

import type Filter from "metabase-lib/lib/queries/structured/Filter";

import { PickerContainer, PickerGrid } from "./InlineCategoryPicker.styled";

import { isValidOption } from "./utils";

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
