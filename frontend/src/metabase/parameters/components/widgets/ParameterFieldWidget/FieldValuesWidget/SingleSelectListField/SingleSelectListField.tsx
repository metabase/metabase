import type { ChangeEventHandler } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/content-translation/plugins";
import { Box, Input, TextInput } from "metabase/ui";
import { delay } from "metabase/utils/delay";
import type { RowValue } from "metabase-types/api";

import {
  createOptionsFromValuesWithoutOptions,
  getOptionDisplayName,
  normalizeValuesToOptionKeys,
  optionItemEqualsFilter,
  optionMatchesFilter,
} from "../ListField/utils";

import S from "./SingleSelectListField.module.css";
import type { Option, SingleSelectListFieldProps } from "./types";

const DEBOUNCE_FILTER_TIME = delay(100);

export const SingleSelectListField = ({
  onChange,
  value,
  options,
  optionRenderer,
  placeholder = t`Find...`,
  onSearchChange,
  isDashboardFilter,
}: SingleSelectListFieldProps) => {
  const normalizedValue = useMemo(
    () => normalizeValuesToOptionKeys(value, options),
    [value, options],
  );
  const [selectedValue, setSelectedValue] = useState(normalizedValue[0]);
  const [addedOptions, setAddedOptions] = useState<Option[]>(() =>
    createOptionsFromValuesWithoutOptions(normalizedValue, options),
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
    filter.length > 0 && filteredOptions.length === 0;

  const onClickOption = (option: RowValue) => {
    if (selectedValue !== option) {
      setSelectedValue(option);
      const maybeTranslatedOption =
        typeof option === "string" ? tc(option) : String(option);
      setFilter(maybeTranslatedOption);
      onChange([option]);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (
      event.key === "Enter" &&
      filter.trim().length > 0 &&
      !augmentedOptions.some((option) => optionItemEqualsFilter(option, filter))
    ) {
      event.preventDefault();
      setAddedOptions([...addedOptions, [filter]]);
    }
  };

  const handleFilterChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const value = evt.target.value;
    setFilter(value);
    onChange([]);
    setSelectedValue(null);
    onSearchChange?.(value);
  };

  const selectedBackground = isDashboardFilter
    ? "background_surface-selected"
    : "core-filter";

  const handleResetClick = () => {
    setFilter("");
    onChange([]);
    setSelectedValue(null);
    onSearchChange?.("");
  };

  return (
    <>
      <TextInput
        autoFocus
        placeholder={placeholder}
        value={filter}
        onChange={handleFilterChange}
        onKeyDown={handleKeyDown}
        rightSectionPointerEvents="all"
        rightSection={
          filter.length > 0 ? (
            <Input.ClearButton c="text-secondary" onClick={handleResetClick} />
          ) : null
        }
        mb={isDashboardFilter ? 0 : "sm"}
        data-testid="single-select-list-field"
      />

      {shouldShowEmptyState && (
        <Box pt="xxl" px="xxl">
          <EmptyState message={t`Didn't find anything`} icon="search" />
        </Box>
      )}

      <Box
        component="ul"
        className={S.optionsList}
        mah={isDashboardFilter ? 300 : undefined}
        pt="sm"
      >
        {filteredOptions.map((option) => {
          const isSelected = selectedValue === option[0];

          return (
            <li key={String(option[0])}>
              <Box
                className={S.optionItem}
                data-testid={`${option[0]}-filter-value`}
                display="inline-block"
                w="100%"
                p="sm"
                bdrs="xxs"
                c={isSelected ? "text-selected" : undefined}
                bg={isSelected ? selectedBackground : undefined}
                onClick={() => onClickOption(option[0])}
                onMouseDown={(e) => e.preventDefault()}
              >
                {optionRenderer(option)}
              </Box>
            </li>
          );
        })}
      </Box>
    </>
  );
};
