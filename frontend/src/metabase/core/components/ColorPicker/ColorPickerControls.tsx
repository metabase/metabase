import type { CustomPickerInjectedProps } from "react-color";
import { CustomPicker } from "react-color";
import { Hue, Saturation } from "react-color/lib/components/common";

import {
  ControlsRoot,
  HueContainer,
  HuePointer,
  SaturationContainer,
  SaturationPointer,
} from "./ColorPicker.styled";

const saturationStyles = {
  color: {
    borderTopLeftRadius: "5px",
    borderBottomRightRadius: "5px",
  },
};

const ColorPickerControls = CustomPicker(function ColorControls(
  props: CustomPickerInjectedProps,
) {
  return (
    <ControlsRoot>
      <SaturationContainer>
        <Saturation
          {...props}
          pointer={SaturationPointer}
          style={saturationStyles}
        />
      </SaturationContainer>
      <HueContainer>
        <Hue {...props} pointer={HuePointer} />
      </HueContainer>
    </ControlsRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorPickerControls;
