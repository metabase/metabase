import {
  type BoxProps,
  Combobox,
  type ComboboxItem,
  OptionsDropdown,
  Pill,
  PillsInput,
  Text,
  Tooltip,
  extractStyleProps,
} from "@mantine/core";
import type { ReactNode } from "react";
import { t } from "ttag";

import { Icon } from "../../icons";

import S from "./MultiAutocomplete.module.css";
import { useMultiAutocomplete } from "./use-multi-autocomplete";

export type MultiAutocompleteProps = BoxProps & {
  values: string[];
  options: ComboboxItem[];
  placeholder?: string;
  autoFocus?: boolean;
  rightSection?: ReactNode;
  nothingFoundMessage?: ReactNode;
  "aria-label"?: string;
  onCreate?: (rawValue: string) => string | null;
  onChange: (newValues: string[]) => void;
  onSearchChange?: (newValue: string) => void;
};

export function MultiAutocomplete({
  values,
  options,
  placeholder,
  autoFocus,
  rightSection,
  nothingFoundMessage,
  "aria-label": ariaLabel,
  onCreate,
  onChange,
  onSearchChange,
  ...otherProps
}: MultiAutocompleteProps) {
  const {
    combobox,
    pillValues,
    filteredOptions,
    fieldValue,
    fieldMinWidth,
    searchValue,
    handleFieldChange,
    handleFieldPaste,
    handleFieldKeyDown,
    handleFieldFocus,
    handleFieldBlur,
    handlePillClick,
    handlePillRemoveClick,
    handlePillGroupClick,
    handlePillsInputClick,
    handleOptionSubmit,
  } = useMultiAutocomplete({
    values,
    options,
    onCreate,
    onChange,
    onSearchChange,
  });

  const { styleProps } = extractStyleProps(otherProps);

  const infoIcon = (
    <Tooltip
      label={
        <Text c="inherit" maw="20rem">
          {t`Separate values with commas, tabs, or newlines. Use double quotes if what you’re searching for has commas — and if it itself includes quotes, use backslashes like this: “searching, you see, is a \\“simple\\” thing.”`}
        </Text>
      }
    >
      <Icon c="text-light" name="info_filled" />
    </Tooltip>
  );

  return (
    <>
      <Combobox
        store={combobox}
        withinPortal={false}
        floatingStrategy="fixed"
        onOptionSubmit={handleOptionSubmit}
      >
        <Combobox.DropdownTarget>
          <PillsInput
            {...styleProps}
            rightSection={rightSection ?? infoIcon}
            onClick={handlePillsInputClick}
          >
            <Pill.Group role="list" onClick={handlePillGroupClick}>
              {pillValues.map((value, valueIndex) =>
                value !== null ? (
                  <Pill
                    key={valueIndex}
                    className={S.pill}
                    withRemoveButton
                    onClick={(event) => handlePillClick(event, valueIndex)}
                    onRemove={() => handlePillRemoveClick(valueIndex)}
                  >
                    {value}
                  </Pill>
                ) : (
                  <Combobox.EventsTarget key="field">
                    <PillsInput.Field
                      className={S.field}
                      value={fieldValue}
                      placeholder={placeholder}
                      role="combobox"
                      miw={fieldMinWidth}
                      autoFocus={autoFocus}
                      aria-label={ariaLabel}
                      onChange={handleFieldChange}
                      onPaste={handleFieldPaste}
                      onKeyDown={handleFieldKeyDown}
                      onFocus={handleFieldFocus}
                      onBlur={handleFieldBlur}
                    />
                  </Combobox.EventsTarget>
                ),
              )}
            </Pill.Group>
          </PillsInput>
        </Combobox.DropdownTarget>
        <OptionsDropdown
          data={filteredOptions}
          search={searchValue}
          nothingFoundMessage={nothingFoundMessage}
          hiddenWhenEmpty={!nothingFoundMessage}
          filter={undefined}
          limit={undefined}
          maxDropdownHeight={undefined}
          unstyled={false}
          labelId={undefined}
          withScrollArea={undefined}
          scrollAreaProps={undefined}
          aria-label={undefined}
        />
      </Combobox>
      <Combobox.HiddenInput value={values} />
    </>
  );
}
