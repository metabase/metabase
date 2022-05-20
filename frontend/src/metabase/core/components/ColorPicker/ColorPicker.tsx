import React, { useCallback } from "react";
import { ColorState, HuePicker } from "react-color";

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
    <div>
      <HuePicker color={color} onChange={handleChange} />
    </div>
  );
};

export default ColorPicker;
