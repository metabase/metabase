import {
  type BoxProps,
  Combobox,
  type ComboboxItem,
  type ComboboxLikeProps,
  type ComboboxLikeRenderOptionInput,
  OptionsDropdown,
  Pill,
  PillsInput,
  Text,
  Tooltip,
  type __InputWrapperProps,
  extractStyleProps,
  getParsedComboboxData,
  isOptionsGroup,
} from "@mantine/core";
import cx from "classnames";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { Icon } from "../../icons";

import S from "./MultiAutocomplete.module.css";
import { useMultiAutocomplete } from "./use-multi-autocomplete";

export type MultiAutocompleteRenderValueProps = {
  value: string;
};

export type MultiAutocompleteRenderOptionProps =
  ComboboxLikeRenderOptionInput<ComboboxItem>;

export type MultiAutocompleteProps = BoxProps &
  __InputWrapperProps &
  ComboboxLikeProps & {
    value: string[];
    placeholder?: string;
    autoFocus?: boolean;
    rightSection?: ReactNode;
    nothingFoundMessage?: ReactNode;
    classNames?: {
      pill?: string;
      input?: string;
    };
    "aria-label"?: string;
    "data-testid"?: string;
    parseValue?: (rawValue: string) => string | null;
    renderValue?: (props: MultiAutocompleteRenderValueProps) => ReactNode;
    renderOption?: (props: MultiAutocompleteRenderOptionProps) => ReactNode;
    sortComparator?: (a: string, b: string) => number;
    onChange: (newValues: string[]) => void;
    onSearchChange?: (newValue: string) => void;
  };

/**
 * Base multi-value autocomplete component. For most use cases, prefer
 * {@link MultiAutocompleteWithTranslation} from `metabase/common/components/MultiAutocomplete`
 * which adds content translation and translation-aware sorting.
 */
export function MultiAutocomplete({
  value,
  data = [],
  filter,
  limit,
  label,
  description,
  error,
  required,
  withAsterisk,
  labelProps,
  descriptionProps,
  errorProps,
  inputContainer,
  inputWrapperOrder,
  placeholder,
  autoFocus,
  rightSection,
  nothingFoundMessage,
  classNames,
  maxDropdownHeight,
  dropdownOpened,
  defaultDropdownOpened,
  selectFirstOptionOnChange,
  withScrollArea,
  comboboxProps,
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
  parseValue = defaultParseValue,
  renderValue = defaultRenderValue,
  renderOption,
  sortComparator,
  onChange,
  onSearchChange,
  onDropdownOpen,
  onDropdownClose,
  onOptionSubmit,
  ...otherProps
}: MultiAutocompleteProps) {
  const sortedData = useMemo(() => {
    const parsedData = getParsedComboboxData(data);
    if (!sortComparator) {
      return parsedData;
    }

    return parsedData
      .map((item) => {
        if (isOptionsGroup(item)) {
          return {
            ...item,
            items: [...item.items].sort((a, b) =>
              sortComparator(a.value, b.value),
            ),
          };
        }
        return item;
      })
      .sort((a, b) => {
        const aValue = isOptionsGroup(a) ? a.group : a.value;
        const bValue = isOptionsGroup(b) ? b.group : b.value;
        return sortComparator(aValue, bValue);
      });
  }, [data, sortComparator]);

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
    values: value,
    data: sortedData,
    parseValue,
    onChange,
    onSearchChange,
  });

  const { styleProps } = extractStyleProps(otherProps);

  const infoIcon = (
    <Tooltip
      label={
        <Text c="inherit" maw="20rem">
          {t`Separate values with commas, tabs, or newlines. Use double quotes if what you're searching for has commas — and if it itself includes quotes, use backslashes like this: "searching, you see, is a \\"simple\\" thing."`}
        </Text>
      }
    >
      <Icon c="text-tertiary" name="info" />
    </Tooltip>
  );

  return (
    <>
      <Combobox
        store={combobox}
        withinPortal={false}
        floatingStrategy="fixed"
        onOptionSubmit={handleOptionSubmit}
        {...comboboxProps}
      >
        <Combobox.DropdownTarget>
          <PillsInput
            {...styleProps}
            classNames={{ input: classNames?.input }}
            label={label}
            description={description}
            error={error}
            required={required}
            rightSection={rightSection === undefined ? infoIcon : rightSection}
            withAsterisk={withAsterisk}
            labelProps={labelProps}
            descriptionProps={descriptionProps}
            errorProps={errorProps}
            inputContainer={inputContainer}
            inputWrapperOrder={inputWrapperOrder}
            data-testid={dataTestId}
            onClick={handlePillsInputClick}
          >
            <Pill.Group role="list" onClick={handlePillGroupClick}>
              {pillValues.map((value, valueIndex) =>
                value !== null ? (
                  <Pill
                    key={valueIndex}
                    className={cx(S.pill, classNames?.pill)}
                    removeButtonProps={{ "aria-label": t`Remove` }}
                    withRemoveButton
                    onClick={(event) => handlePillClick(event, valueIndex)}
                    onRemove={() => handlePillRemoveClick(valueIndex)}
                  >
                    {renderValue({ value })}
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
          value={value}
          data={filteredOptions}
          search={searchValue}
          filter={filter}
          limit={limit}
          maxDropdownHeight={maxDropdownHeight}
          nothingFoundMessage={nothingFoundMessage}
          hiddenWhenEmpty={!nothingFoundMessage}
          unstyled={false}
          labelId={undefined}
          withScrollArea={withScrollArea}
          scrollAreaProps={undefined}
          renderOption={renderOption}
          aria-label={undefined}
        />
      </Combobox>
      <Combobox.HiddenInput value={value} />
    </>
  );
}

function defaultParseValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function defaultRenderValue({ value }: MultiAutocompleteRenderValueProps) {
  return value;
}
