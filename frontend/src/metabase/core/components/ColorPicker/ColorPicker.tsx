import React, { useCallback } from "react";
import { ChromePicker, ColorState } from "react-color";

export interface ColorPickerProps {
  color?: string;
  onChange?: (color: string) => void;
}

const ColorPicker = ({ color, onChange }: ColorPickerProps): JSX.Element => {
  const handleChange = useCallback(
    (state: ColorState) => {
      onChange?.(state.hex);
    },
    [onChange],
  );

  return (
    <ChromePicker
      color={color}
      styles={styles}
      disableAlpha
      onChange={handleChange}
    />
  );
};

const styles = {
  default: {
    picker: {
      boxShadow: "none",
      background: "none",
    },
  },
};

export default ColorPicker;
