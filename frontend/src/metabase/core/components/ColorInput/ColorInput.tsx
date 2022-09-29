import React, {
  ChangeEvent,
  FocusEvent,
  forwardRef,
  InputHTMLAttributes,
  Ref,
  useCallback,
  useMemo,
  useState,
} from "react";
import Color from "color";
import Input from "metabase/core/components/Input";

export type ColorInputAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "value" | "onChange"
>;

export interface ColorInputProps extends ColorInputAttributes {
  value?: string;
  fullWidth?: boolean;
  onChange?: (value?: string) => void;
}

const ColorInput = forwardRef(function ColorInput(
  { value, onFocus, onBlur, onChange, ...props }: ColorInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const colorText = useMemo(() => getColorHex(value) ?? "", [value]);
  const [inputText, setInputText] = useState(colorText);
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      setInputText(colorText);
      onFocus?.(event);
    },
    [colorText, onFocus],
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
      setInputText(newText);
      onChange?.(getColorHex(newText) ?? getColorHex(`#${newText}`));
    },
    [onChange],
  );

  return (
    <Input
      {...props}
      ref={ref}
      value={isFocused ? inputText : colorText}
      size="small"
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
});

const getColorHex = (value?: string) => {
  try {
    return value ? Color(value).hex() : undefined;
  } catch (e) {
    return undefined;
  }
};

export default ColorInput;
