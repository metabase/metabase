import { t } from "ttag";
import Checkbox from "metabase/core/components/CheckBox";

import type Filter from "metabase-lib/queries/structured/Filter";

import { PickerContainer, PickerGrid } from "./InlineCategoryPicker.styled";

import { isValidOption } from "./utils";
import { LONG_OPTION_LENGTH } from "./constants";

type Option = [
  string | number,
  (string | number)?, // optional remapped display value
];

interface SimpleCategoryFilterPickerProps {
  filter: Filter;
  options: Option[];
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
    ([value, displayValue]) =>
      String(displayValue ?? value).length > LONG_OPTION_LENGTH,
  );
  // because we want options to flow by column, we have to explicitly set the number of rows
  const rows = Math.round(options.length / 2);

  return (
    <PickerContainer data-testid="category-picker">
      <PickerGrid multiColumn={hasShortOptions} rows={rows}>
        {options.map(([option, displayOption]) => (
          <Checkbox
            key={option?.toString() ?? "empty"}
            checked={filterValues.includes(option)}
            onChange={e => handleChange(option, e.target.checked)}
            label={(displayOption ?? option)?.toString() ?? t`empty`}
          />
        ))}
      </PickerGrid>
    </PickerContainer>
  );
}
