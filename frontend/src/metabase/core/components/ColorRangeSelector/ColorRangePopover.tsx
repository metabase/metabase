import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import { PopoverRoot, PopoverList } from "./ColorRangePopover.styled";

export interface ColorRangeContentProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: string[];
  colors: string[];
  onChange?: (value: string[]) => void;
}

const ColorSelectorContent = forwardRef(function ColorSelector(
  { value, colors, onChange, ...props }: ColorRangeContentProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <PopoverRoot {...props} ref={ref}>
      <PopoverList>
        {colors.map((option, index) => (
          <ColorPill key={index} color={option} />
        ))}
      </PopoverList>
    </PopoverRoot>
  );
});

export default ColorSelectorContent;
