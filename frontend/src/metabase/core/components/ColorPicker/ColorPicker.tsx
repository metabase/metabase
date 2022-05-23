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
  ContentContainer,
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
  const handleTriggerChange = useCallback(
    (color?: string) => {
      color && onChange?.(color);
    },
    [onChange],
  );

  const handleContentChange = useCallback(
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
          onChange={handleTriggerChange}
        />
      )}
      popoverContent={
        <ColorPickerContent color={color} onChange={handleContentChange} />
      }
    />
  );
};

interface ColorPickerTriggerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  color: string;
  isBordered?: boolean;
  isSelected?: boolean;
  onChange?: (color?: string) => void;
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
  return (
    <TriggerContainer {...props} ref={ref}>
      <ColorPill
        color={color}
        isBordered={isBordered}
        isSelected={isSelected}
        onClick={onClick}
      />
      <ColorInput color={color} onChange={onChange} />
    </TriggerContainer>
  );
});

const ColorPickerContent = CustomPicker(function ColorControls(
  props: CustomPickerInjectedProps,
) {
  return (
    <ContentContainer>
      <SaturationContainer>
        <Saturation {...props} />
      </SaturationContainer>
      <HueContainer>
        <Hue {...props} />
      </HueContainer>
    </ContentContainer>
  );
});

export default ColorPicker;
