import React, { forwardRef, HTMLAttributes, Ref } from "react";
import { ColorPillContent, ColorPillRoot } from "./ColorPill.styled";

export interface ColorPillProps extends HTMLAttributes<HTMLDivElement> {
  color?: string;
  isBordered?: boolean;
  isSelected?: boolean;
  isGenerated?: boolean;
}

const ColorPill = forwardRef(function ColorPill(
  { color, isBordered, isSelected, isGenerated, ...props }: ColorPillProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <ColorPillRoot
      {...props}
      ref={ref}
      isBordered={isBordered}
      isSelected={isSelected}
      isGenerated={isGenerated}
    >
      <ColorPillContent
        isBordered={isBordered}
        style={{ backgroundColor: color }}
      />
    </ColorPillRoot>
  );
});

export default ColorPill;
