import { Key, useMemo, useState } from "react";
import _ from "underscore";

import CheckBox from "metabase/core/components/CheckBox";
import Filter from "metabase-lib/queries/structured/Filter";

import { CheckboxContainer } from "./BooleanPicker.styled";

import { OPTIONS } from "./constants";
import { getValue } from "./utils";
import { Checkbox } from "@mantine/core";

interface BooleanPickerProps {
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  className?: string;
}

export function BooleanPickerCheckboxTest({
  filter,
  onFilterChange,
  className,
}: BooleanPickerProps) {
  const value = useMemo(() => getValue(filter), [filter]);

  const updateFilter = (value: Key | boolean) => {
    console.log(value)
    if (getValue(filter) === value) {
      onFilterChange(filter.setArguments([]));
    } else if (_.isBoolean(value)) {
      onFilterChange(filter.setOperator("=").setArguments([value]));
    } else if (typeof value === "string") {
      onFilterChange(filter.setOperator(value));
    }
  };

  return (
    <Checkbox.Group value={[String(value)]} onChange={(opt) => updateFilter(JSON.parse(opt.at(-1)))}>
      {OPTIONS.map(({ name, value: optionValue }) => (
        <Checkbox
          key={name}
          label={`${name} ${optionValue}`}
          value={String(optionValue)}
          checked={optionValue === value}
          indeterminate={["is-null", "not-null"].includes(value)}
        />
      ))}
    </Checkbox.Group>
  );
}
