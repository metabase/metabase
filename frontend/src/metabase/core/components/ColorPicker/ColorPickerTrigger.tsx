import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import ColorInput from "metabase/core/components/ColorInput";
import { TriggerContainer } from "./ColorPicker.styled";

export interface ColorPickerTriggerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  color: string;
  isBordered?: boolean;
  isSelected?: boolean;
  isGenerated?: boolean;
  onChange?: (color?: string) => void;
}

const ColorPickerTrigger = forwardRef(function ColorPickerTrigger(
  {
    color,
    isBordered,
    isSelected,
    isGenerated,
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
        isGenerated={isGenerated}
        onClick={onClick}
      />
      <ColorInput color={color} onChange={onChange} />
    </TriggerContainer>
  );
});

export default ColorPickerTrigger;
