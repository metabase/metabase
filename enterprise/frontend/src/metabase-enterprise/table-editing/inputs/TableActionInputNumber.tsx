import { useCallback, useState } from "react";

import { NumberInput } from "metabase/ui";

import type { TableActionInputSharedProps } from "./types";

export type TableActionInputNumberProps = TableActionInputSharedProps & {
  allowDecimal?: boolean;
  classNames?: {
    wrapper?: string;
    numberInputElement?: string;
  };
};

export const TableActionInputNumber = ({
  allowDecimal,
  autoFocus,
  inputProps,
  initialValue,
  classNames,
  onEscape,
  onEnter,
  onBlur,
  onChange,
}: TableActionInputNumberProps) => {
  const [value, setValue] = useState<string | number>(initialValue ?? "");

  const handleChange = useCallback(
    (value: string | number) => {
      setValue(value);
      onChange?.(numberToRawValue(value));
    },
    [onChange],
  );

  const handleBlur = useCallback(() => {
    onBlur?.(numberToRawValue(value));
  }, [onBlur, value]);

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        onEscape?.(numberToRawValue(value));
      } else if (event.key === "Enter") {
        onEnter?.(numberToRawValue(value));
      }
    },
    [onEscape, onEnter, value],
  );

  return (
    <NumberInput
      allowDecimal={allowDecimal}
      defaultValue={(initialValue ?? "").toString()}
      autoFocus={autoFocus}
      onKeyUp={handleKeyUp}
      onChange={handleChange}
      onBlur={handleBlur}
      classNames={{
        wrapper: classNames?.wrapper,
        input: classNames?.numberInputElement,
      }}
      {...inputProps}
    />
  );
};

function numberToRawValue(value: string | number) {
  return typeof value === "number" ? value.toString() : value;
}
