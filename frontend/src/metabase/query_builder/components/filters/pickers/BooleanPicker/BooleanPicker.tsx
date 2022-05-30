import React, { Key } from "react";
import _ from "underscore";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { RadioOption } from "metabase/core/components/Radio/Radio";

import { Container, Toggle, FilterRadio } from "./BooleanPicker.styled";

const OPTIONS: RadioOption<boolean>[] = [
  { name: t`true`, value: true },
  { name: t`false`, value: false },
];

const EXPANDED_OPTIONS: RadioOption<string | boolean | any>[] = [
  { name: t`true`, value: true },
  { name: t`false`, value: false },
  { name: t`empty`, value: "is-null" },
  { name: t`not empty`, value: "not-null" },
];

interface BooleanPickerProps {
  className?: string;
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
}

function BooleanPicker({
  className,
  filter,
  onFilterChange,
}: BooleanPickerProps) {
  const value = getValue(filter);
  const [isExpanded, { toggle }] = useToggle(!_.isBoolean(value));

  const updateFilter = (value: Key) => {
    if (_.isBoolean(value)) {
      onFilterChange(filter.setOperator("=").setArguments([value]));
    } else if (typeof value === "string") {
      onFilterChange(filter.setOperator(value));
    }
  };

  return (
    <Container className={className}>
      <FilterRadio
        vertical
        colorScheme="accent7"
        options={isExpanded ? EXPANDED_OPTIONS : OPTIONS}
        value={value}
        onChange={updateFilter}
      />
      {!isExpanded && <Toggle onClick={toggle} />}
    </Container>
  );
}

function getValue(filter: Filter) {
  const operatorName = filter.operatorName();
  if (operatorName === "=") {
    const [value] = filter.arguments();
    return value;
  } else {
    return operatorName;
  }
}

export default BooleanPicker;
