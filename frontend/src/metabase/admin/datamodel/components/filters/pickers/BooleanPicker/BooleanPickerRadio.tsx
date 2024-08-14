import _ from "underscore";

import { useToggle } from "metabase/hooks/use-toggle";
import type Filter from "metabase-lib/v1/queries/structured/Filter";

import { RadioContainer, Toggle, FilterRadio } from "./BooleanPicker.styled";
import { OPTIONS, EXPANDED_OPTIONS } from "./constants";
import { getValue } from "./utils";

interface BooleanPickerProps {
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  className?: string;
}

function BooleanPicker({
  className,
  filter,
  onFilterChange,
}: BooleanPickerProps) {
  const value = getValue(filter);
  const [isExpanded, { toggle }] = useToggle(!_.isBoolean(value));

  const updateFilter = (value: unknown) => {
    if (_.isBoolean(value)) {
      onFilterChange(filter.setOperator("=").setArguments([value]));
    } else if (typeof value === "string") {
      onFilterChange(filter.setOperator(value));
    }
  };

  return (
    <RadioContainer className={className}>
      <FilterRadio
        vertical
        colorScheme="accent7"
        options={isExpanded ? EXPANDED_OPTIONS : OPTIONS}
        value={value}
        onChange={updateFilter}
      />
      {!isExpanded && <Toggle onClick={toggle} />}
    </RadioContainer>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BooleanPicker;
