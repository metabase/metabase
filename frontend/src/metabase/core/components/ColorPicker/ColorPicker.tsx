import React from "react";
import {
  ColorState,
  CustomPicker,
  CustomPickerInjectedProps,
} from "react-color";
import { Hue, Saturation } from "react-color/lib/components/common";
import { HueContainer, SaturationContainer } from "./ColorPicker.styled";

export type ColorChangeEvent = ColorState;

const ColorPicker = (props: CustomPickerInjectedProps): JSX.Element => {
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
};

export default CustomPicker(ColorPicker);
