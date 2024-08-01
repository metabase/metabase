import type * as React from "react";
import { useMemo, useState, useContext } from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/components/EmptyState";
import { waitTimeContext } from "metabase/context/wait-time";
import type { InputProps } from "metabase/core/components/Input";
import Input from "metabase/core/components/Input";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import type { RowValue } from "metabase-types/api";

import {
  OptionContainer,
  OptionsList,
  EmptyStateContainer,
  OptionItem,
  FilterInputContainer,
} from "./SingleSelectListField.styled";
import type { SingleSelectListFieldProps, Option } from "./types";
import { isValidOptionItem } from "./utils";

function createOptionsFromValuesWithoutOptions(
  values: RowValue[],
  options: Option[],
): Option {
  const optionsMap = _.indexBy(options, "0");
  return values
    .filter(value => typeof value !== "string" || !optionsMap[value])
    .map(value => [value]);
}

const SingleSelectListField = ({
  onChange,
  value,
  options,
  optionRenderer,
  placeholder = t`Find...`,
  isDashboardFilter,
  checkedColor,
}: SingleSelectListFieldProps) => {
  const [selectedValue, setSelectedValue] = useState(value?.[0]);
  const [addedOptions, setAddedOptions] = useState<Option>(() =>
    createOptionsFromValuesWithoutOptions(value, options),
  );

  const augmentedOptions = useMemo<Option[]>(() => {
    return [...options.filter(option => option[0] != null), ...addedOptions];
  }, [addedOptions, options]);

  const sortedOptions = useMemo(() => {
    if (selectedValue) {
      return augmentedOptions;
    }

    const [selected, unselected] = _.partition(
      augmentedOptions,
      option => selectedValue === option[0],
    );

    return [...selected, ...unselected];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [augmentedOptions.length]);

  const [filter, setFilter] = useState("");
  const waitTime = useContext(waitTimeContext);
  const debouncedFilter = useDebouncedValue(filter, waitTime);

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

  const onClickOption = (option: any) => {
    if (selectedValue !== option) {
      setSelectedValue(option);
      onChange?.([option]);
    }
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
        {filteredOptions.map(option => (
          <OptionContainer key={option[0]}>
            <OptionItem
              data-testid={`${option[0]}-filter-value`}
              selectedColor={
                checkedColor ?? isDashboardFilter
                  ? "var(--mb-color-background-brand)"
                  : "var(--mb-color-filter)"
              }
              selected={selectedValue === option[0]}
              onClick={() => onClickOption(option[0])}
              onMouseDown={e => e.preventDefault()}
            >
              {optionRenderer(option)}
            </OptionItem>
          </OptionContainer>
        ))}
      </OptionsList>
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SingleSelectListField;
