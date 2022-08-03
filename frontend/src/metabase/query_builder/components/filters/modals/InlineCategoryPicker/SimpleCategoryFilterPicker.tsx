import React from "react";
import { t } from "ttag";
import Checkbox from "metabase/core/components/CheckBox";

import type Filter from "metabase-lib/lib/queries/structured/Filter";

import { PickerContainer, PickerGrid } from "./InlineCategoryPicker.styled";

import { isValidOption } from "./utils";
import { LONG_OPTION_LENGTH } from "./constants";

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

  const hasShortOptions = !options.find(
    option => String(option).length > LONG_OPTION_LENGTH,
  );
  // because we want options to flow by column, we have to explicitly set the number of rows
  const rows = Math.round(options.length / 2);

  return (
    <PickerContainer data-testid="category-picker">
      <PickerGrid multiColumn={hasShortOptions} rows={rows}>
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
