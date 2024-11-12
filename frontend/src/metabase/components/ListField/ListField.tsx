import type * as React from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/components/EmptyState";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import type { InputProps } from "metabase/core/components/Input";
import Input from "metabase/core/components/Input";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { Checkbox, Flex } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import {
  EmptyStateContainer,
  FilterInputContainer,
  OptionContainer,
  OptionsList,
} from "./ListField.styled";
import type { ListFieldProps, Option } from "./types";
import { isValidOptionItem } from "./utils";

const DEBOUNCE_FILTER_TIME = 100;

function createOptionsFromValuesWithoutOptions(
  values: RowValue[],
  options: Option[],
): Option {
  const optionsMap = new Map(options.map(option => [option[0], option]));
  return values.filter(value => !optionsMap.has(value)).map(value => [value]);
}

export const ListField = ({
  onChange,
  value,
  options,
  optionRenderer,
  placeholder,
  isDashboardFilter,
  isLoading,
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
  const debouncedFilter = useDebouncedValue(filter, DEBOUNCE_FILTER_TIME);

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

  const selectedFilteredOptions = filteredOptions.filter(([value]) =>
    selectedValues.has(value),
  );
  const isAll = selectedFilteredOptions.length === filteredOptions.length;
  const isNone = selectedFilteredOptions.length === 0;

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

  const handleToggleAll = () => {
    const newSelectedValuesSet = new Set(selectedValues);
    filteredOptions.forEach(([value]) => {
      if (isAll) {
        newSelectedValuesSet.delete(value);
      } else {
        newSelectedValuesSet.add(value);
      }
    });
    onChange(Array.from(newSelectedValuesSet));
    setSelectedValues(newSelectedValuesSet);
  };

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

      {isLoading && (
        <Flex p="md" align="center" justify="center">
          <LoadingSpinner size={24} />
        </Flex>
      )}

      {!isLoading && (
        <OptionsList isDashboardFilter={isDashboardFilter}>
          {filteredOptions.length > 0 && (
            <OptionContainer>
              <Checkbox
                variant="stacked"
                label={getToggleAllLabel(debouncedFilter, isAll)}
                checked={isAll}
                indeterminate={!isAll && !isNone}
                onChange={handleToggleAll}
              />
            </OptionContainer>
          )}
          {filteredOptions.map((option, index) => (
            <OptionContainer key={index}>
              <Checkbox
                data-testid={`${option[0]}-filter-value`}
                checked={selectedValues.has(option[0])}
                label={optionRenderer(option)}
                onChange={() => handleToggleOption(option[0])}
              />
            </OptionContainer>
          ))}
        </OptionsList>
      )}
    </>
  );
};

function getToggleAllLabel(searchValue: string, isAll: boolean) {
  if (isAll) {
    return t`Select none`;
  } else {
    return searchValue ? t`Select these` : t`Select all`;
  }
}
