import cx from "classnames";
import type { CustomPickerInjectedProps } from "react-color";
import { CustomPicker } from "react-color";
import { Hue, Saturation } from "react-color/lib/components/common";

import { Box } from "metabase/ui";

import S from "./ColorPicker.module.css";

const saturationStyles = {
  color: {
    borderTopLeftRadius: "5px",
    borderBottomRightRadius: "5px",
  },
};

export const ColorPickerControls = CustomPicker(function ColorControls(
  props: CustomPickerInjectedProps,
) {
  return (
    <Box className={S.controls}>
      <Box className={S.track} h="10rem" mb="lg">
        <Saturation
          {...props}
          pointer={SaturationPointer}
          style={saturationStyles}
        />
      </Box>
      <Box className={S.track} h="0.5rem">
        <Hue {...props} pointer={HuePointer} />
      </Box>
    </Box>
  );
});

function SaturationPointer() {
  return <Box className={cx(S.pointer, S.saturationPointer)} />;
}

function HuePointer() {
  return <Box className={cx(S.pointer, S.huePointer)} />;
}
