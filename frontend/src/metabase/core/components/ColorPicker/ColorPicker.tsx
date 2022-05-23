import React, { forwardRef, HTMLAttributes, Ref, useCallback } from "react";
import {
  ColorState,
  CustomPicker,
  CustomPickerInjectedProps,
} from "react-color";
import { Hue, Saturation } from "react-color/lib/components/common";
import ColorPill from "metabase/core/components/ColorPill";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import {
  PickerContainer,
  HueContainer,
  SaturationContainer,
  TriggerContainer,
} from "./ColorPicker.styled";
import ColorInput from "metabase/core/components/ColorInput";

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
        <ColorPickerTrigger
          color={color}
          isBordered={isBordered}
          isSelected={isSelected}
          onClick={onClick}
          onChange={onChange}
        />
      )}
      popoverContent={
        <ColorPickerContent color={color} onChange={handleChange} />
      }
    />
  );
};

interface ColorPickerTriggerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  color: string;
  isBordered?: boolean;
  isSelected?: boolean;
  onChange?: (color: string) => void;
}

const ColorPickerTrigger = forwardRef(function ColorPickerTrigger(
  {
    color,
    isBordered,
    isSelected,
    onClick,
    onChange,
    ...props
  }: ColorPickerTriggerProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleChange = useCallback(
    (color?: string) => {
      color && onChange?.(color);
    },
    [onChange],
  );

  return (
    <TriggerContainer {...props} ref={ref}>
      <ColorPill
        color={color}
        isBordered={isBordered}
        isSelected={isSelected}
        onClick={onClick}
      />
      <ColorInput color={color} onChange={handleChange} />
    </TriggerContainer>
  );
});

const ColorPickerContent = CustomPicker(function ColorControls(
  props: CustomPickerInjectedProps,
) {
  return (
    <PickerContainer>
      <SaturationContainer>
        <Saturation {...props} />
      </SaturationContainer>
      <HueContainer>
        <Hue {...props} />
      </HueContainer>
    </PickerContainer>
  );
});

export default ColorPicker;
