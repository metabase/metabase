import type { Key } from "react";
import _ from "underscore";

import CheckBox from "metabase/core/components/CheckBox";
import type Filter from "metabase-lib/v1/queries/structured/Filter";

import { CheckboxContainer } from "./BooleanPicker.styled";
import { OPTIONS } from "./constants";
import { getValue } from "./utils";

interface BooleanPickerProps {
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  className?: string;
}

export function BooleanPickerCheckbox({
  filter,
  onFilterChange,
  className,
}: BooleanPickerProps) {
  const value = getValue(filter);

  const updateFilter = (value: Key | boolean) => {
    if (getValue(filter) === value) {
      onFilterChange(filter.setArguments([]));
    } else if (_.isBoolean(value)) {
      onFilterChange(filter.setOperator("=").setArguments([value]));
    } else if (typeof value === "string") {
      onFilterChange(filter.setOperator(value));
    }
  };

  return (
    <CheckboxContainer className={className}>
      {OPTIONS.map(({ name, value: optionValue }) => (
        <CheckBox
          key={name}
          label={name}
          indeterminate={["is-null", "not-null"].includes(value)}
          checked={optionValue === getValue(filter)}
          onChange={() => updateFilter(optionValue)}
          checkedColor="brand"
        />
      ))}
    </CheckboxContainer>
  );
}
