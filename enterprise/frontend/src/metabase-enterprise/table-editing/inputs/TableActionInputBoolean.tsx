import { useCallback, useMemo, useState } from "react";

import { Combobox, Input, useCombobox } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import type { TableActionInputSharedProps } from "./types";

export type TableActionInputBooleanProps = TableActionInputSharedProps & {
  classNames?: {
    wrapper?: string;
    selectTextInputElement?: string;
  };
};

const NULL_LABEL = "None";

export const TableActionInputBoolean = ({
  autoFocus,
  inputProps,
  initialValue,
  classNames,
  isNullable,
  onEscape,
  onBlur,
  onChange,
}: TableActionInputBooleanProps) => {
  const [value, setValue] = useState(rowValueToOptionValue(initialValue));

  const combobox = useCombobox({
    defaultOpened: autoFocus,
  });

  const handleOptionSubmit = useCallback(
    (value: string) => {
      setValue(value);
      onChange?.(optionValueToRowValue(value));
      onBlur?.(optionValueToRowValue(value));
      combobox.closeDropdown();
    },
    [setValue, onChange, onBlur, combobox],
  );

  const handleDismiss = useCallback(() => {
    onEscape?.(optionValueToRowValue(value));
  }, [onEscape, value]);

  const options = useMemo(
    () => [
      { value: "true", label: "True" },
      { value: "false", label: "False" },
      ...(isNullable ? [{ value: "", label: NULL_LABEL }] : []),
    ],
    [isNullable],
  );

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      onOptionSubmit={handleOptionSubmit}
      onDismiss={handleDismiss}
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
          {...inputProps}
        >
          {value ? (
            value
          ) : (
            <Input.Placeholder c="text-tertiary">
              {NULL_LABEL}
            </Input.Placeholder>
          )}
        </Input>
      </Combobox.Target>

      <Combobox.Dropdown mah="none" miw={150}>
        <Combobox.Options p="0.5rem">
          {options.map((item) => (
            <Combobox.Option
              selected={value === item.value}
              value={item.value}
              key={item.value}
            >
              {item.label}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
};

function rowValueToOptionValue(value?: RowValue): string {
  if (value === "true" || value === "false") {
    return value;
  }

  return "";
}

function optionValueToRowValue(value?: string | null): string | null {
  if (value === "true" || value === "false") {
    return value;
  }

  return null;
}
