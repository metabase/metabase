import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Combobox,
  Icon,
  Input,
  Loader,
  Text,
  TextInput,
  useCombobox,
} from "metabase/ui";

import type { ActionInputSharedProps } from "./types";
import { useActionInputSearchableOptions } from "./use-action-input-searchable-options";

type ActionInputTextProps = ActionInputSharedProps & {
  fieldId: number;
  searchFieldId?: number;
  withCreateNew?: boolean;
  classNames?: {
    wrapper?: string;
    selectTextInputElement?: string;
  };
};

export const ActionInputSearchableSelect = ({
  autoFocus,
  inputProps,
  initialValue,
  classNames,
  isNullable,
  fieldId,
  searchFieldId,
  withCreateNew,
  onBlur,
  onChange,
}: ActionInputTextProps) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue?.toString() ?? "");
  const [search, setSearch] = useState("");

  const focusSearchInput = useCallback(() => {
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  const combobox = useCombobox({
    defaultOpened: autoFocus,
    onDropdownOpen: focusSearchInput,
  });

  const { options, isLoading, isFetching } = useActionInputSearchableOptions({
    search,
    fieldId: fieldId,
    searchFieldId: searchFieldId,
  });

  const handleOptionSubmit = useCallback(
    (value: string | null) => {
      setValue(value ?? "");
      onChange?.(value);

      // Close the dropdown
      onBlur?.(value);
      combobox.closeDropdown();
    },
    [setValue, onChange, onBlur, combobox],
  );

  const inputLabel = useMemo(() => {
    if (isLoading) {
      return (
        <Input.Placeholder c="text-light">{t`Loading...`}</Input.Placeholder>
      );
    }

    if (!value && inputProps?.placeholder) {
      return (
        <Input.Placeholder c="text-light">
          {inputProps.placeholder}
        </Input.Placeholder>
      );
    }

    if (value) {
      // If searchFieldId is provided, display the label instead of the value
      if (searchFieldId) {
        const option = options.find((item) => item.value === value);
        if (option) {
          return <Text truncate="end">{option.label}</Text>;
        }
      }

      // Fallback to the raw value instead of a label
      return <Text truncate="end">{value}</Text>;
    }

    return null;
  }, [isLoading, value, inputProps?.placeholder, options, searchFieldId]);

  const shouldDisplayClearButton =
    isNullable && !!value && !inputProps?.disabled;

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.Target>
        <Input
          component="button"
          type="button"
          role="combobox"
          pointer
          onClick={() => combobox.openDropdown()}
          classNames={{
            wrapper: classNames?.wrapper,
            input: classNames?.selectTextInputElement,
          }}
          style={{ overflow: "hidden" }} // for label truncation
          rightSectionPointerEvents="all"
          rightSection={
            shouldDisplayClearButton && (
              <Icon
                name="close"
                color="var(--mb-color-text-light)"
                onClick={() => handleOptionSubmit(null)}
                onMouseDown={(event) => event.stopPropagation()}
              />
            )
          }
          {...inputProps}
        >
          {inputLabel}
        </Input>
      </Combobox.Target>

      <Combobox.Dropdown mah="none" miw={250}>
        <Box p="0.5rem" pb="0" bg="white" pos="sticky" top={0}>
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={t`Search the list`}
            leftSection={<Icon name="search" />}
            rightSection={isFetching ? <Loader size="xs" /> : undefined}
            // Auto focus works when dropdown is initially rendered as opened (e.g. inline editing)
            // whereas `onDropdownOpen` is called only when dropdown is opened by clicking the button (e.g. modal editing)
            autoFocus
            ref={searchInputRef}
          />
        </Box>

        <Combobox.Options p="0.5rem">
          {options.length > 0 ? (
            options.map((item) => (
              <Combobox.Option
                selected={value === item.value}
                value={item.value}
                key={item.value}
              >
                {item.label}
                {searchFieldId ? ` [${item.value}]` : ""}
              </Combobox.Option>
            ))
          ) : isLoading ? (
            <Combobox.Empty>{t`Loading values...`}</Combobox.Empty>
          ) : withCreateNew ? (
            <Combobox.Option value={search}>
              {t`Add option:`} <strong>{search}</strong>
            </Combobox.Option>
          ) : (
            <Combobox.Empty>{t`Nothing found`}</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
};
