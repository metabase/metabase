import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import { PopoverRoot } from "./ColorSelectorPopover.styled";

export interface ColorSelectorPopoverProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: string;
  colors: string[];
  onChange?: (value: string) => void;
}

const ColorSelectorPopover = forwardRef(function ColorSelector(
  { value, colors, onChange, ...props }: ColorSelectorPopoverProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <PopoverRoot {...props} ref={ref}>
      {colors.map((option, index) => (
        <ColorPill
          key={index}
          color={option}
          isSelected={value === option}
          onClick={() => onChange?.(option)}
        />
      ))}
    </PopoverRoot>
  );
});

export default ColorSelectorPopover;
