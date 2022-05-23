import React, { useCallback } from "react";
import {
  ColorState,
  CustomPicker,
  CustomPickerInjectedProps,
} from "react-color";
import { Hue, Saturation } from "react-color/lib/components/common";
import ColorPill from "metabase/core/components/ColorPill";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import {
  ControlsContainer,
  HueContainer,
  SaturationContainer,
} from "./ColorPicker.styled";

export interface ColorPickerProps {
  color: string;
  isBordered?: boolean;
  isSelected?: boolean;
  onChange?: (color: string) => void;
}

const ColorPicker = ({
  color,
  isBordered,
  isSelected,
  onChange,
}: ColorPickerProps): JSX.Element => {
  const handleChange = useCallback(
    (state: ColorState) => {
      onChange?.(state.hex);
    },
    [onChange],
  );

  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <ColorPill
          color={color}
          isBordered={isBordered}
          isSelected={isSelected}
          onClick={onClick}
        />
      )}
      popoverContent={<ColorControls color={color} onChange={handleChange} />}
    />
  );
};

const ColorControls = CustomPicker(function ColorControls(
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

export default ColorPicker;
