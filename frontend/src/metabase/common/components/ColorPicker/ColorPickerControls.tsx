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

const POINTER_BORDER = "0.125rem solid var(--mb-color-background_page-primary)";

export const ColorPickerControls = CustomPicker(function ColorControls(
  props: CustomPickerInjectedProps,
) {
  return (
    <Box className={S.controls}>
      <Box className={S.track} pos="relative" h="10rem" mb="lg" bdrs="xxs">
        <Saturation
          {...props}
          pointer={SaturationPointer}
          style={saturationStyles}
        />
      </Box>
      <Box className={S.track} pos="relative" h="0.5rem" bdrs="xxs">
        <Hue {...props} pointer={HuePointer} />
      </Box>
    </Box>
  );
});

function SaturationPointer() {
  return (
    <Box
      className={cx(S.pointer, S.saturationPointer)}
      w="0.875rem"
      h="0.875rem"
      bd={POINTER_BORDER}
      bdrs="50%"
    />
  );
}

function HuePointer() {
  return (
    <Box
      className={cx(S.pointer, S.huePointer)}
      w="0.625rem"
      h="0.625rem"
      bd={POINTER_BORDER}
      bdrs="50%"
    />
  );
}
