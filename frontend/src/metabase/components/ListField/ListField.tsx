import { useMemo, useState } from "react";
import type * as React from "react";
import _ from "underscore";
import { t } from "ttag";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import Checkbox from "metabase/core/components/CheckBox";
import EmptyState from "metabase/components/EmptyState";

import type { InputProps } from "metabase/core/components/Input";
import Input from "metabase/core/components/Input";
import {
  OptionContainer,
  LabelWrapper,
  OptionsList,
  EmptyStateContainer,
  FilterInputContainer,
} from "./ListField.styled";
import type { ListFieldProps, Option } from "./types";
import { isValidOptionItem } from "./utils";

function createOptionsFromValuesWithoutOptions(
  values: string[],
  options: Option[],
): Option {
  const optionsMap = _.indexBy(options, "0");
  return values.filter(value => !optionsMap[value]).map(value => [value]);
}

export const ListField = ({
  onChange,
  value,
  options,
  optionRenderer,
  placeholder,
  isDashboardFilter,
  checkedColor,
}: ListFieldProps) => {
  const [selectedValues, setSelectedValues] = useState(new Set(value));
  const [addedOptions, setAddedOptions] = useState<Option>(() =>
    createOptionsFromValuesWithoutOptions(value, options),
  );

  const augmentedOptions = useMemo(() => {
    return [...options.filter(option => option[0] != null), ...addedOptions];
  }, [addedOptions, options]);

  const sortedOptions = useMemo(() => {
    if (selectedValues.size === 0) {
      return augmentedOptions;
    }

    const [selected, unselected] = _.partition(augmentedOptions, option =>
      selectedValues.has(option[0]),
    );

    return [...selected, ...unselected];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [augmentedOptions.length]);

  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebouncedValue(filter, SEARCH_DEBOUNCE_DURATION);

  const filteredOptions = useMemo(() => {
    const formattedFilter = debouncedFilter.trim().toLowerCase();
    if (formattedFilter.length === 0) {
      return sortedOptions;
    }

    return augmentedOptions.filter(option => {
      if (!option || option.length === 0) {
        return false;
      }

      // option as: [id, name]
      if (
        option.length > 1 &&
        option[1] &&
        isValidOptionItem(option[1], formattedFilter)
      ) {
        return true;
      }

      // option as: [id]
      return isValidOptionItem(option[0], formattedFilter);
    });
  }, [augmentedOptions, debouncedFilter, sortedOptions]);

  const shouldShowEmptyState =
    augmentedOptions.length > 0 && filteredOptions.length === 0;

  const handleToggleOption = (option: any) => {
    const newSelectedValues = selectedValues.has(option)
      ? Array.from(selectedValues).filter(value => value !== option)
      : [...selectedValues, option];

    setSelectedValues(new Set(newSelectedValues));
    onChange?.(newSelectedValues);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (
      event.key === "Enter" &&
      !_.find(augmentedOptions, option => option[0] === filter)
    ) {
      setAddedOptions([...addedOptions, [filter]]);
    }
  };

  const handleFilterChange: InputProps["onChange"] = e =>
    setFilter(e.target.value);

  return (
    <>
      <FilterInputContainer isDashboardFilter={isDashboardFilter}>
        <Input
          fullWidth
          autoFocus
          placeholder={placeholder}
          value={filter}
          onChange={handleFilterChange}
          onKeyDown={handleKeyDown}
          onResetClick={() => setFilter("")}
        />
      </FilterInputContainer>

      {shouldShowEmptyState && (
        <EmptyStateContainer>
          <EmptyState message={t`Didn't find anything`} icon="search" />
        </EmptyStateContainer>
      )}

      <OptionsList isDashboardFilter={isDashboardFilter}>
        {filteredOptions.map((option, index) => (
          <OptionContainer key={index}>
            <Checkbox
              data-testid={`${option[0]}-filter-value`}
              checkedColor={
                checkedColor ?? isDashboardFilter ? "brand" : "filter"
              }
              checked={selectedValues.has(option[0])}
              label={<LabelWrapper>{optionRenderer(option)}</LabelWrapper>}
              onChange={() => handleToggleOption(option[0])}
            />
          </OptionContainer>
        ))}
      </OptionsList>
    </>
  );
};
