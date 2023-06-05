import { CustomPicker, CustomPickerInjectedProps } from "react-color";
import { Hue, Saturation } from "react-color/lib/components/common";
import {
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
    <div>
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
    </div>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorPickerControls;
