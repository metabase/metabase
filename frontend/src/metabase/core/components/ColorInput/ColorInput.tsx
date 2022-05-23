import React, {
  InputHTMLAttributes,
  FocusEvent,
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
    const color = Color(value);
    return color.hex();
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

  return <Input onFocus={handleFocus} onBlur={handleBlur} />;
};

export default ColorInput;
