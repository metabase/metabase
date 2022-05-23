import React from "react";
import { CustomPicker, CustomPickerInjectedProps } from "react-color";
import { Hue, Saturation } from "react-color/lib/components/common";
import { HueContainer, SaturationContainer } from "./ColorPicker.styled";

const ColorPickerControls = CustomPicker(function ColorControls(
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

export default ColorPickerControls;
