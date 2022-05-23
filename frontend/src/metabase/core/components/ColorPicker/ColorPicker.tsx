import React, { useCallback } from "react";
import {
  ColorState,
  CustomPicker,
  CustomPickerInjectedProps,
} from "react-color";
import { Hue, Saturation } from "react-color/lib/components/common";
import { HueContainer, SaturationContainer } from "./ColorPicker.styled";

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

  return <ColorControls color={color} onChange={handleChange} />;
};

const ColorControls = CustomPicker(function ColorControls(
  props: CustomPickerInjectedProps,
) {
  return (
    <div>
      <SaturationContainer>
        <Saturation {...props} />
      </SaturationContainer>
      <HueContainer>
        <Hue {...props} />
      </HueContainer>
    </div>
  );
});

export default ColorPicker;
