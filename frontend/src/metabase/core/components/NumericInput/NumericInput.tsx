import type { ChangeEvent, FocusEvent, InputHTMLAttributes, Ref } from "react";
import { forwardRef, useCallback, useMemo, useState } from "react";

import Input from "metabase/core/components/Input";

export type NumericInputAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "value" | "size" | "onChange"
>;

export interface NumericInputProps extends NumericInputAttributes {
  value?: number | string;
  error?: boolean;
  fullWidth?: boolean;
  onChange?: (value: number | undefined) => void;
}

/**
 * @deprecated: use NumberInput from "metabase/ui"
 */
const NumericInput = forwardRef(function NumericInput(
  { value, onFocus, onBlur, onChange, ...props }: NumericInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const valueText = useMemo(() => value?.toString() ?? "", [value]);
  const [inputText, setInputText] = useState(valueText);
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      setInputText(valueText);
      onFocus?.(event);
    },
    [valueText, onFocus],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(event);
    },
    [onBlur],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const newText = event.target.value;
      const newValue = parseFloat(newText);
      setInputText(newText);

      if (!isNaN(newValue)) {
        onChange?.(newValue);
      } else {
        onChange?.(undefined);
      }
    },
    [onChange],
  );

  return (
    <Input
      {...props}
      ref={ref}
      value={isFocused ? inputText : valueText}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NumericInput;
