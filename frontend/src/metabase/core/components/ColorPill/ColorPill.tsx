import React, { forwardRef, HTMLAttributes, Ref } from "react";
import { ColorPillContent, ColorPillRoot } from "./ColorPill.styled";

export interface ColorPillProps extends HTMLAttributes<HTMLDivElement> {
  color: string;
  isBordered?: boolean;
  isSelected?: boolean;
  isDefault?: boolean;
}

const ColorPill = forwardRef(function ColorPill(
  {
    color,
    isBordered,
    isSelected,
    isDefault,
    "aria-label": ariaLabel = color,
    ...props
  }: ColorPillProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <ColorPillRoot
      {...props}
      ref={ref}
      isBordered={isBordered}
      isSelected={isSelected}
      isDefault={isDefault}
      aria-label={ariaLabel}
    >
      <ColorPillContent
        isBordered={isBordered}
        style={{ backgroundColor: color }}
      />
    </ColorPillRoot>
  );
});

export default ColorPill;
