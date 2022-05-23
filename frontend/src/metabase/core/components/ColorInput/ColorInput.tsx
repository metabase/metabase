import React, {
  ChangeEvent,
  FocusEvent,
  InputHTMLAttributes,
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
  color?: string;
  onChange?: (value?: string) => void;
}

const ColorInput = ({
  color,
  onFocus,
  onBlur,
  onChange,
}: ColorInputProps): JSX.Element => {
  const [inputText, setInputText] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const colorText = useMemo(() => {
    return color ? Color(color).hex() : "";
  }, [color]);

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

      try {
        onChange?.(Color(newText).hex());
      } catch (e) {
        onChange?.(undefined);
      }
    },
    [onChange],
  );

  return (
    <Input
      value={isFocused ? inputText : colorText}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
};

export default ColorInput;
