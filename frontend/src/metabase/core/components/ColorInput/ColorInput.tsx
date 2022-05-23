import React, {
  InputHTMLAttributes,
  FocusEvent,
  useCallback,
  useMemo,
  useState,
  ChangeEvent,
} from "react";
import Color from "color";
import Input from "metabase/core/components/Input";

export type ColorInputAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "value" | "onChange"
>;

export interface ColorInputProps extends ColorInputAttributes {
  value?: string;
  onChange?: (value?: string) => void;
}

const ColorInput = ({
  value,
  onFocus,
  onBlur,
  onChange,
}: ColorInputProps): JSX.Element => {
  const [inputText, setInputText] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const valueText = useMemo(() => {
    return value ? Color(value).hex() : "";
  }, [value]);

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
      setInputText(newText);

      try {
        const color = Color(newText);
        onChange?.(color.hex());
      } catch (e) {
        onChange?.(undefined);
      }
    },
    [onChange],
  );

  return (
    <Input
      value={isFocused ? inputText : valueText}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
};

export default ColorInput;
