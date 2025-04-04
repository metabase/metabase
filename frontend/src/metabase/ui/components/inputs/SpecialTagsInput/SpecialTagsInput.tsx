import {
  Combobox,
  OptionsDropdown,
  Pill,
  PillsInput,
  type TagsInputFactory,
  type TagsInputProps,
  __BaseInputProps,
  __InputStylesNames,
  extractStyleProps,
  getOptionsLockup,
  getParsedComboboxData,
  useCombobox,
  useResolvedStylesApi,
  useStyles,
} from "@mantine/core";
import { useId, useMergedRef, useUncontrolled } from "@mantine/hooks";
import type React from "react";
import { forwardRef, useEffect, useRef } from "react";

import { Icon } from "metabase/ui";

import { filterPickedTags } from "./filter-picked-tags";
import { getSplittedTags } from "./get-splitted-tags";

type SpecialTagsInputProps = TagsInputProps & {
  nothingFoundMessage?: React.ReactNode;
};

export const SpecialTagsInput = forwardRef(function _SpecialTagsInput(
  props: SpecialTagsInputProps,
  ref,
) {
  const {
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    size,
    value,
    defaultValue,
    onChange,
    onKeyDown,
    maxTags = 75,
    allowDuplicates,
    onDuplicate,
    variant,
    data,
    dropdownOpened,
    defaultDropdownOpened,
    onDropdownOpen,
    onDropdownClose,
    selectFirstOptionOnChange,
    onOptionSubmit,
    comboboxProps,
    filter,
    limit,
    withScrollArea,
    maxDropdownHeight,
    searchValue,
    defaultSearchValue,
    onSearchChange,
    readOnly,
    disabled,
    splitChars,
    onFocus,
    onBlur,
    onPaste,
    radius,
    rightSection,
    rightSectionWidth,
    rightSectionPointerEvents,
    rightSectionProps,
    leftSection,
    leftSectionWidth,
    leftSectionPointerEvents,
    leftSectionProps,
    inputContainer,
    inputWrapperOrder,
    withAsterisk,
    required,
    labelProps,
    descriptionProps,
    errorProps,
    wrapperProps,
    description,
    label,
    error,
    withErrorStyles,
    name,
    form,
    id,
    clearable,
    clearButtonProps,
    hiddenInputProps,
    hiddenInputValuesDivider,
    mod,
    renderOption,
    onRemove,
    onClear,
    scrollAreaProps,
    acceptValueOnBlur,
    nothingFoundMessage,
    ...others
  } = props;

  const _id = useId(id);
  const parsedData = getParsedComboboxData(data);
  const optionsLockup = getOptionsLockup(parsedData);
  const inputRef = useRef<HTMLInputElement>(null);
  const _ref = useMergedRef(inputRef, ref);

  const combobox = useCombobox({
    opened: dropdownOpened,
    defaultOpened: defaultDropdownOpened,
    onDropdownOpen,
    onDropdownClose: () => {
      onDropdownClose?.();
      combobox.resetSelectedOption();
    },
  });

  const {
    styleProps,
    rest: { type, autoComplete, ...rest },
  } = extractStyleProps(others);

  const [_value, setValue] = useUncontrolled({
    value,
    defaultValue,
    finalValue: [],
    onChange,
  });

  const [_searchValue, setSearchValue] = useUncontrolled({
    value: searchValue,
    defaultValue: defaultSearchValue,
    finalValue: "",
    onChange: onSearchChange,
  });

  const getStyles = useStyles<TagsInputFactory>({
    name: "TagsInput",
    classes: {},
    props,
    classNames,
    styles,
    unstyled,
  });

  const { resolvedClassNames, resolvedStyles } =
    useResolvedStylesApi<TagsInputFactory>({ props, styles, classNames });

  const handleValueSelect = (val: string) => {
    const isDuplicate = _value.some(
      tag => tag.toLowerCase() === val.toLowerCase(),
    );

    if (isDuplicate) {
      onDuplicate?.(val);
    }

    if (
      (!isDuplicate || (isDuplicate && allowDuplicates)) &&
      _value.length < maxTags!
    ) {
      onOptionSubmit?.(val);
      if (val.length > 0) {
        setValue([..._value, val]);
      }
      // Moved this to below setValue
      setSearchValue("");
    }
  };

  const handleInputKeydown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);

    if (event.isPropagationStopped()) {
      return;
    }

    const inputValue = _searchValue.trim();
    const { length } = inputValue;

    if (splitChars!.includes(event.key) && length > 0) {
      setValue(
        getSplittedTags({
          splitChars,
          allowDuplicates,
          maxTags,
          value: _searchValue,
          currentTags: _value,
        }),
      );
      setSearchValue("");
      event.preventDefault();
    }

    if (event.key === "Enter" && length > 0 && !event.nativeEvent.isComposing) {
      event.preventDefault();

      const hasActiveSelection = !!document.querySelector<HTMLDivElement>(
        `#${combobox.listId} [data-combobox-option][data-combobox-selected]`,
      );

      if (hasActiveSelection) {
        return;
      }

      handleValueSelect(inputValue);
    }

    if (
      event.key === "Backspace" &&
      length === 0 &&
      _value.length > 0 &&
      !event.nativeEvent.isComposing
    ) {
      onRemove?.(_value[_value.length - 1]);
      setValue(_value.slice(0, _value.length - 1));
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    onPaste?.(event);
    event.preventDefault();

    if (event.clipboardData) {
      const pastedText = event.clipboardData.getData("text/plain");
      setValue(
        getSplittedTags({
          splitChars,
          allowDuplicates,
          maxTags,
          value: `${_searchValue}${pastedText}`,
          currentTags: _value,
        }),
      );
      setSearchValue("");
    }
  };

  const values = _value.map((item, index) => {
    return (
      <Pill
        key={`${item}-${index}`}
        withRemoveButton={!readOnly && !optionsLockup[item]?.disabled}
        onRemove={() => {
          const next_value = _value.slice();
          next_value.splice(index, 1);
          setValue(next_value);
          onRemove?.(item);
        }}
        unstyled={unstyled}
        disabled={disabled}
        {...getStyles("pill")}
      >
        {optionsLockup[item]?.label || item}
      </Pill>
    );
  });

  useEffect(() => {
    if (selectFirstOptionOnChange) {
      combobox.selectFirstOption();
    }
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectFirstOptionOnChange, _value, _searchValue]);

  const clearButton = clearable &&
    _value.length > 0 &&
    !disabled &&
    !readOnly && (
      <Combobox.ClearButton
        size={size as string}
        {...clearButtonProps}
        onClear={() => {
          setValue([]);
          setSearchValue("");
          inputRef.current?.focus();
          combobox.openDropdown();
          onClear?.();
        }}
      />
    );

  return (
    <>
      <Combobox
        store={combobox}
        classNames={resolvedClassNames}
        styles={resolvedStyles}
        unstyled={unstyled}
        size={size}
        readOnly={readOnly}
        __staticSelector="TagsInput"
        onOptionSubmit={val => {
          onOptionSubmit?.(val);
          // Moved this to be before setSearchValue, and passing back the proper value
          // rather than the label
          _value.length < maxTags! && setValue([..._value, val]);
          setSearchValue("");

          combobox.resetSelectedOption();
        }}
        {...comboboxProps}
      >
        <Combobox.DropdownTarget>
          <PillsInput
            {...styleProps}
            __staticSelector="TagsInput"
            classNames={resolvedClassNames}
            styles={resolvedStyles}
            unstyled={unstyled}
            size={size}
            className={className}
            style={style}
            variant={variant}
            disabled={disabled}
            radius={radius}
            rightSection={
              rightSection ||
              clearButton || <Icon name="chevrondown" data-combobox-chevron /> // This should really be <Combobox.Chevron />
            }
            rightSectionWidth={rightSectionWidth}
            rightSectionPointerEvents={rightSectionPointerEvents}
            rightSectionProps={rightSectionProps}
            leftSection={leftSection}
            leftSectionWidth={leftSectionWidth}
            leftSectionPointerEvents={leftSectionPointerEvents}
            leftSectionProps={leftSectionProps}
            inputContainer={inputContainer}
            inputWrapperOrder={inputWrapperOrder}
            withAsterisk={withAsterisk}
            required={required}
            labelProps={labelProps}
            descriptionProps={descriptionProps}
            errorProps={errorProps}
            wrapperProps={wrapperProps}
            description={description}
            label={label}
            error={error}
            multiline
            withErrorStyles={withErrorStyles}
            __stylesApiProps={{ ...props, multiline: true }}
            id={_id}
            mod={mod}
          >
            <Pill.Group
              disabled={disabled}
              unstyled={unstyled}
              role="list"
              {...getStyles("pillsList")}
            >
              {values}
              <Combobox.EventsTarget autoComplete={autoComplete}>
                <PillsInput.Field
                  {...rest}
                  ref={_ref}
                  {...getStyles("inputField")}
                  unstyled={unstyled}
                  onKeyDown={handleInputKeydown}
                  onFocus={event => {
                    onFocus?.(event);
                    combobox.openDropdown();
                  }}
                  onBlur={event => {
                    onBlur?.(event);
                    acceptValueOnBlur && handleValueSelect(_searchValue);
                    combobox.closeDropdown();
                  }}
                  onPaste={handlePaste}
                  value={_searchValue}
                  onChange={event => setSearchValue(event.currentTarget.value)}
                  required={required && _value.length === 0}
                  disabled={disabled}
                  readOnly={readOnly}
                  id={_id}
                />
              </Combobox.EventsTarget>
            </Pill.Group>
          </PillsInput>
        </Combobox.DropdownTarget>
        {/* @ts-expect-error - I've removed some thing that mantine thinks is required as a library, as an end user aren't */}
        <OptionsDropdown
          data={filterPickedTags({ data: parsedData, value: _value })}
          hidden={readOnly || disabled}
          filter={filter}
          search={_searchValue}
          limit={limit}
          hiddenWhenEmpty={!nothingFoundMessage}
          nothingFoundMessage={nothingFoundMessage}
          withScrollArea={withScrollArea}
          maxDropdownHeight={maxDropdownHeight}
          unstyled={unstyled}
          // labelId={label ? `${_id}-label` : undefined}
          // aria-label={label ? undefined : others["aria-label"]}
          renderOption={renderOption}
          scrollAreaProps={scrollAreaProps}
        />
      </Combobox>
      <Combobox.HiddenInput
        name={name}
        form={form}
        value={_value}
        valuesDivider={hiddenInputValuesDivider}
        disabled={disabled}
        {...hiddenInputProps}
      />
    </>
  );
});
