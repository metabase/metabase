import type * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { EmptyState } from "metabase/common/components/EmptyState";
import type { InputProps } from "metabase/common/components/Input";
import { Input } from "metabase/common/components/Input";
import { LoadingSpinner } from "metabase/common/components/LoadingSpinner";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useTranslateContent } from "metabase/i18n/hooks";
import { delay } from "metabase/lib/delay";
import { optionItemEqualsFilter } from "metabase/parameters/components/widgets/ParameterFieldWidget/FieldValuesWidget/SingleSelectListField/utils";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { Checkbox, Flex, Text } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import {
  EmptyStateContainer,
  FilterInputContainer,
  OptionContainer,
  OptionsList,
} from "./ListField.styled";
import type { ListFieldProps, Option } from "./types";
import { getOptionDisplayName, optionMatchesFilter } from "./utils";

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
  const [addedOptions, setAddedOptions] = useState<Option[]>(() =>
    createOptionsFromValuesWithoutOptions(value, options),
  );

  const augmentedOptions = useMemo(() => {
    return [...options.filter((option) => option[0] != null), ...addedOptions];
  }, [addedOptions, options]);

  const tc = useTranslateContent();
  const sortByTranslation =
    PLUGIN_CONTENT_TRANSLATION.useSortByContentTranslation();

  const optionsHaveSomeTranslations = useMemo(
    () => augmentedOptions.some(([option]) => tc(option) !== option),
    [augmentedOptions, tc],
  );

  /**
   * Sorts options alphabetically, or by their translation if content
   * translation is enabled. Selected options are sorted to the top. Since
   * options are arrays, the last item in the array is used as the name of the
   * option.
   */
  const sortOptions = useCallback(
    (optionA: Option, optionB: Option) => {
      const aSelected = selectedValues.has(optionA[0]),
        bSelected = selectedValues.has(optionB[0]);

      if (aSelected && !bSelected) {
        return -1;
      }
      if (!aSelected && bSelected) {
        return 1;
      }

      // If no options have translations, rely on the sorting that was already
      // done in the backend
      if (!optionsHaveSomeTranslations) {
        return 0;
      }

      const aName = getOptionDisplayName(optionA),
        bName = getOptionDisplayName(optionB);
      return typeof aName === "string" && typeof bName === "string"
        ? sortByTranslation(aName, bName)
        : 0;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedValues is omitted from the deps so that selecting a value does not trigger re-sorting
    [sortByTranslation],
  );

  const sortedOptions = useMemo(
    () => augmentedOptions.sort(sortOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [augmentedOptions.length, sortOptions],
  );

  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebouncedValue(filter, DEBOUNCE_FILTER_TIME);

  const filteredOptions = useMemo(() => {
    const formattedFilter = debouncedFilter.trim().toLowerCase();
    if (formattedFilter.length === 0) {
      return sortedOptions;
    }
    return sortedOptions.filter((option) =>
      optionMatchesFilter(option, formattedFilter, tc),
    );
  }, [debouncedFilter, sortedOptions, tc]);

  const selectedFilteredOptions = filteredOptions.filter(([value]) =>
    selectedValues.has(value),
  );
  const isAll = selectedFilteredOptions.length === filteredOptions.length;
  const isNone = selectedFilteredOptions.length === 0;

  const shouldShowEmptyState =
    augmentedOptions.length > 0 && filteredOptions.length === 0;

  const handleToggleOption = (option: any) => {
    const newSelectedValues = selectedValues.has(option)
      ? Array.from(selectedValues).filter((value) => value !== option)
      : [...selectedValues, option];

    setSelectedValues(new Set(newSelectedValues));
    onChange?.(newSelectedValues);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (
      event.key === "Enter" &&
      filter.trim().length > 0 &&
      !_.find(augmentedOptions, (option) =>
        optionItemEqualsFilter(option[0], filter),
      )
    ) {
      event.preventDefault();
      setAddedOptions([...addedOptions, [filter]]);
    }
  };

  const handleFilterChange: InputProps["onChange"] = (e) =>
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
          data-testid="list-field"
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
                label={
                  <Text c="text-secondary">
                    {debouncedFilter ? t`Select these` : t`Select all`}
                  </Text>
                }
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
