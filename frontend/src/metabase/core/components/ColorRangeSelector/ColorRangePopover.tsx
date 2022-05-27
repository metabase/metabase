import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import { PopoverRoot, PopoverList } from "./ColorRangePopover.styled";
import ColorRangeToggle from "metabase/core/components/ColorRangeSelector/ColorRangeToggle";

export interface ColorRangeContentProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: string[];
  colors: string[];
  ranges?: string[][];
  onChange?: (value: string[]) => void;
}

const ColorSelectorContent = forwardRef(function ColorSelector(
  { value, colors, ranges = [], onChange, ...props }: ColorRangeContentProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <PopoverRoot {...props} ref={ref}>
      <PopoverList>
        {colors.map((option, index) => (
          <ColorPill key={index} color={option} />
        ))}
      </PopoverList>
      {ranges?.map((range, index) => (
        <ColorRangeToggle key={index} value={range} onChange={onChange} />
      ))}
    </PopoverRoot>
  );
});

export default ColorSelectorContent;
