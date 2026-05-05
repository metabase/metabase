import { useCallback, useState } from "react";

import { NumberInput } from "metabase/ui";

import type { TableActionInputSharedProps } from "./types";

export type TableActionInputNumberProps = TableActionInputSharedProps & {
  allowDecimal?: boolean;
  hideControls?: boolean;
  classNames?: {
    wrapper?: string;
    numberInputElement?: string;
  };
};

export const TableActionInputNumber = ({
  allowDecimal,
  hideControls = true,
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

  const handleChange = useCallback((value: string | number) => {
    setValue(value);
  }, []);

  const handleChangeValue = useCallback(
    ({ value }: { value: string }) => {
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
      hideControls={hideControls}
      allowDecimal={allowDecimal}
      defaultValue={(initialValue ?? "").toString()}
      autoFocus={autoFocus}
      onKeyUp={handleKeyUp}
      // Somehow onChange triggers on the first blur, so we rely on onValueChange instead
      onChange={handleChange}
      onValueChange={handleChangeValue}
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
  if (value === "") {
    return null;
  }

  return value.toString();
}
