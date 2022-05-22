import React, { useCallback } from "react";
import { ChromePicker, ColorState } from "react-color";
import { getStyles } from "./ColorPicker.styled";

export interface ColorPickerProps {
  className?: string;
  color?: string;
  onChange?: (color: string) => void;
}

const ColorPicker = ({
  className,
  color,
  onChange,
}: ColorPickerProps): JSX.Element => {
  const handleChange = useCallback(
    (state: ColorState) => {
      onChange?.(state.hex);
    },
    [onChange],
  );

  return (
    <ChromePicker
      className={className}
      color={color}
      styles={getStyles()}
      disableAlpha
      onChange={handleChange}
    />
  );
};

export default ColorPicker;
