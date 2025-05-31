import type * as React from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/components/EmptyState";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import type { InputProps } from "metabase/core/components/Input";
import Input from "metabase/core/components/Input";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import {
  useSortByContentTranslation,
  useTranslateContent,
} from "metabase/i18n/hooks";
import { delay } from "metabase/lib/delay";
import { Flex } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import { getOptionDisplayName } from "../ListField/types";
import { optionMatchesFilter } from "../ListField/utils";

import {
  EmptyStateContainer,
  FilterInputContainer,
  OptionContainer,
  OptionItem,
  OptionsList,
} from "./SingleSelectListField.styled";
import type { Option, SingleSelectListFieldProps } from "./types";

const DEBOUNCE_FILTER_TIME = delay(100);

function createOptionsFromValuesWithoutOptions(
  values: RowValue[],
  options: Option[],
): Option[] {
  const optionsMap = _.indexBy(options, "0");
  return values
    .filter((value) => typeof value !== "string" || !optionsMap[value])
    .map((value) => [value]);
}

const SingleSelectListField = ({
  onChange,
  value,
  options,
  optionRenderer,
  placeholder = t`Find...`,
  onSearchChange,
  isDashboardFilter,
  isLoading,
  checkedColor,
}: SingleSelectListFieldProps) => {
  const [selectedValue, setSelectedValue] = useState(value?.[0]);
  const [addedOptions, setAddedOptions] = useState<Option[]>(() =>
    createOptionsFromValuesWithoutOptions(value, options),
  );
  const tc = useTranslateContent();
  const sortByTranslation = useSortByContentTranslation();

  const augmentedOptions = useMemo<Option[]>(() => {
    return [...options.filter((option) => option[0] != null), ...addedOptions];
  }, [addedOptions, options]);

  const sortedOptions = useMemo(
    () =>
      augmentedOptions.toSorted((optionA, optionB) =>
        sortByTranslation(
          getOptionDisplayName(optionA),
          getOptionDisplayName(optionB),
        ),
      ),
    [augmentedOptions, sortByTranslation],
  );

  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebouncedValue(filter, DEBOUNCE_FILTER_TIME);

  const isFilterInValues = tc(String(value[0])) === filter;

  const filteredOptions = useMemo(() => {
    const formattedFilter = debouncedFilter.trim().toLowerCase();
    if (formattedFilter.length === 0) {
      return sortedOptions;
    }

    // When the user selects a value, this populates the search field, but this
    // should not filter the list. This way, the user can select a value, and
    // then select a different value
    if (isFilterInValues) {
      return sortedOptions;
    }

    return sortedOptions.filter((option) =>
      optionMatchesFilter(option, formattedFilter, tc),
    );
  }, [debouncedFilter, sortedOptions, isFilterInValues, tc]);

  const shouldShowEmptyState =
    filter.length > 0 && !isLoading && filteredOptions.length === 0;

  const onClickOption = (option: any) => {
    if (selectedValue !== option) {
      setSelectedValue(option);
      const maybeTranslatedOption =
        typeof option === "string" ? tc(option) : String(option);
      setFilter(maybeTranslatedOption);
      onChange?.([option]);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (
      event.key === "Enter" &&
      filter.trim().length > 0 &&
      !_.find(augmentedOptions, (option) => option[0] === filter)
    ) {
      event.preventDefault();
      setAddedOptions([...addedOptions, [filter]]);
    }
  };

  const handleFilterChange: InputProps["onChange"] = (evt) => {
    const value = evt.target.value;
    setFilter(value);
    onChange([]);
    setSelectedValue(null);
    onSearchChange?.(value);
  };

  const handleResetClick = () => {
    setFilter("");
    onChange([]);
    setSelectedValue(null);
    onSearchChange?.("");
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
          onResetClick={handleResetClick}
          data-testid="single-select-list-field"
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
          {filteredOptions.map((option) => (
            <OptionContainer key={String(option[0])}>
              <OptionItem
                data-testid={`${option[0]}-filter-value`}
                selectedColor={
                  (checkedColor ?? isDashboardFilter)
                    ? "var(--mb-color-background-selected)"
                    : "var(--mb-color-filter)"
                }
                selected={selectedValue === option[0]}
                onClick={() => onClickOption(option[0])}
                onMouseDown={(e) => e.preventDefault()}
              >
                {optionRenderer(option)}
              </OptionItem>
            </OptionContainer>
          ))}
        </OptionsList>
      )}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SingleSelectListField;
