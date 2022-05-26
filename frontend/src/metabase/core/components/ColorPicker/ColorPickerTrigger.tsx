import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import ColorInput from "metabase/core/components/ColorInput";
import { TriggerContainer } from "./ColorPicker.styled";

export interface ColorPickerTriggerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  color: string;
  placeholder?: string;
  isAuto?: boolean;
  onChange?: (color?: string) => void;
}

const ColorPickerTrigger = forwardRef(function ColorPickerTrigger(
  {
    color,
    placeholder,
    isAuto,
    onClick,
    onChange,
    ...props
  }: ColorPickerTriggerProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <TriggerContainer {...props} ref={ref}>
      <ColorPill color={color} isAuto={isAuto} onClick={onClick} />
      <ColorInput
        color={color}
        placeholder={placeholder}
        fullWidth
        onChange={onChange}
      />
    </TriggerContainer>
  );
});

export default ColorPickerTrigger;
