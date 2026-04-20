import { useCallback, useMemo } from "react";
import type { CustomPickerInjectedProps, RGBColor } from "react-color";
import { CustomPicker } from "react-color";
import { Hue, Saturation } from "react-color/lib/components/common";

import { AlphaSlider } from "./AlphaSlider";
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

interface ColorPickerControlsExtraProps {
  showAlpha?: boolean;
}

type ColorControlsProps = CustomPickerInjectedProps &
  ColorPickerControlsExtraProps;

export const ColorPickerControls = CustomPicker<ColorPickerControlsExtraProps>(
  function ColorControls(props: ColorControlsProps) {
    const { showAlpha, rgb, onChange } = props;
    const safeRgb: RGBColor = useMemo(
      () => rgb ?? { r: 0, g: 0, b: 0, a: 1 },
      [rgb],
    );

    const handleAlphaChange = useCallback(
      (alpha: number) => {
        onChange({ ...safeRgb, a: alpha });
      },
      [onChange, safeRgb],
    );

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
        {showAlpha && (
          <AlphaSlider
            rgb={safeRgb}
            alpha={safeRgb.a ?? 1}
            onAlphaChange={handleAlphaChange}
          />
        )}
      </ControlsRoot>
    );
  },
);
