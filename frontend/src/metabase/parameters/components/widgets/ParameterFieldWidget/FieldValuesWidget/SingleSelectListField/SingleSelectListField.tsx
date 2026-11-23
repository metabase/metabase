import type { ChangeEventHandler } from "react";
import { useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/content-translation/plugins";
import { Box, Input, TextInput, UnstyledButton } from "metabase/ui";
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

export const SingleSelectListField = ({
  onChange,
  value,
  options,
  optionRenderer,
  placeholder = t`Find...`,
  onSearchChange,
  isDashboardFilter,
}: SingleSelectListFieldProps) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLUListElement>(null);
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

  const filteredOptions = useMemo(() => {
    const formattedFilter = filter.trim().toLowerCase();
    if (formattedFilter.length === 0) {
      return sortedOptions;
    }

    return sortedOptions.filter((option) =>
      optionMatchesFilter(option, formattedFilter, tc),
    );
  }, [filter, sortedOptions, tc]);

  const shouldShowEmptyState =
    filter.length > 0 && filteredOptions.length === 0;

  const onClickOption = (option: RowValue) => {
    if (selectedValue !== option) {
      setSelectedValue(option);
      onChange([option]);
    }
  };

  const lastOptionIndex = filteredOptions.length - 1;
  const focusOption = (index: number) =>
    optionsRef.current?.children.item(index)?.querySelector("button")?.focus();

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (filteredOptions.length > 0) {
        event.preventDefault();
        focusOption(event.key === "ArrowDown" ? 0 : lastOptionIndex);
      }
      return;
    }
    if (
      event.key === "Enter" &&
      selectedValue == null &&
      filter.trim().length > 0 &&
      !augmentedOptions.some((option) => optionItemEqualsFilter(option, filter))
    ) {
      event.preventDefault();
      setAddedOptions([...addedOptions, [filter]]);
    }
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusOption(Math.min(index + 1, lastOptionIndex));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (index === 0) {
          searchRef.current?.focus();
        } else {
          focusOption(index - 1);
        }
        break;
      case "Home":
        event.preventDefault();
        focusOption(0);
        break;
      case "End":
        event.preventDefault();
        focusOption(lastOptionIndex);
        break;
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
    searchRef.current?.focus();
  };

  return (
    <>
      <TextInput
        ref={searchRef}
        aria-label={t`Search filter values`}
        autoFocus
        placeholder={placeholder}
        value={filter}
        onChange={handleFilterChange}
        onKeyDown={handleKeyDown}
        rightSectionPointerEvents="all"
        rightSection={
          filter.length > 0 ? (
            <Input.ClearButton
              aria-label={t`Clear search`}
              c="text-secondary"
              onClick={handleResetClick}
            />
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
        ref={optionsRef}
        aria-label={t`Filter values`}
        className={S.optionsList}
        mah={isDashboardFilter ? 300 : undefined}
        pt="sm"
      >
        {filteredOptions.map((option, index) => {
          const isSelected = selectedValue === option[0];

          return (
            <li key={String(option[0])}>
              <UnstyledButton
                type="button"
                aria-pressed={isSelected}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
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
              </UnstyledButton>
            </li>
          );
        })}
      </Box>
    </>
  );
};
