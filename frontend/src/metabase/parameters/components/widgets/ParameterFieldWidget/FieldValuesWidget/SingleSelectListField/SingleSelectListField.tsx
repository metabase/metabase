import type * as React from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { EmptyState } from "metabase/common/components/EmptyState";
import type { InputProps } from "metabase/common/components/Input";
import { Input } from "metabase/common/components/Input";
import { LoadingSpinner } from "metabase/common/components/LoadingSpinner";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useTranslateContent } from "metabase/i18n/hooks";
import { delay } from "metabase/lib/delay";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { Flex } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import { getOptionDisplayName, optionMatchesFilter } from "../ListField/utils";

import {
  EmptyStateContainer,
  FilterInputContainer,
  OptionContainer,
  OptionItem,
  OptionsList,
} from "./SingleSelectListField.styled";
import type { Option, SingleSelectListFieldProps } from "./types";
import { optionItemEqualsFilter } from "./utils";

const DEBOUNCE_FILTER_TIME = delay(100);

function createOptionsFromValuesWithoutOptions(
  values: RowValue[],
  options: Option[],
): Option[] {
  const optionsMap = new Map(options.map((option) => [option[0], option]));
  return values
    .filter((value) => !optionsMap.has(value))
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
  const sortByTranslation =
    PLUGIN_CONTENT_TRANSLATION.useSortByContentTranslation();

  const augmentedOptions = useMemo<Option[]>(() => {
    return [...options.filter((option) => option[0] != null), ...addedOptions];
  }, [addedOptions, options]);

  const optionsHaveSomeTranslations = useMemo(
    () =>
      augmentedOptions.some(
        ([option]) => tc(option satisfies RowValue) !== option,
      ),
    [augmentedOptions, tc],
  );

  const sortedOptions = useMemo(
    () =>
      // If no options have translations, rely on the sorting that was already
      // done in the backend
      optionsHaveSomeTranslations
        ? augmentedOptions.toSorted((optionA, optionB) =>
            sortByTranslation(
              getOptionDisplayName(optionA),
              getOptionDisplayName(optionB),
            ),
          )
        : augmentedOptions,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [augmentedOptions.length, sortByTranslation],
  );

  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebouncedValue(filter, DEBOUNCE_FILTER_TIME);

  const isFilterInValues = optionItemEqualsFilter(
    tc(getOptionDisplayName(value)),
    filter,
  );

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
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (
      event.key === "Enter" &&
      filter.trim().length > 0 &&
      !_.find(augmentedOptions, (option) =>
        optionItemEqualsFilter(option, filter),
      )
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
