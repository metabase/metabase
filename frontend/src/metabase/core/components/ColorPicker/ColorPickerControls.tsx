import React from "react";
import { CustomPicker, CustomPickerInjectedProps } from "react-color";
import { Hue, Saturation } from "react-color/lib/components/common";
import {
  ControlsContainer,
  HueContainer,
  SaturationContainer,
} from "./ColorPicker.styled";

const ColorPickerControls = CustomPicker(function ColorControls(
  props: CustomPickerInjectedProps,
) {
  return (
    <ControlsContainer>
      <SaturationContainer>
        <Saturation {...props} />
      </SaturationContainer>
      <HueContainer>
        <Hue {...props} />
      </HueContainer>
    </ControlsContainer>
  );
});

export default ColorPickerControls;
