import React from "react";
import {
  ColorState,
  CustomPicker,
  CustomPickerInjectedProps,
} from "react-color";
import { Hue } from "react-color/lib/components/common";

export type ColorChangeEvent = ColorState;

const ColorPicker = (props: CustomPickerInjectedProps): JSX.Element => {
  return (
    <div>
      <Hue {...props} />
    </div>
  );
};

export default CustomPicker(ColorPicker);
