import React, { forwardRef, HTMLAttributes, Ref } from "react";
import { ColorPillContent, ColorPillRoot } from "./ColorPill.styled";

export interface ColorPillProps extends HTMLAttributes<HTMLDivElement> {
  color: string;
  isAuto?: boolean;
  isSelected?: boolean;
}

const ColorPill = forwardRef(function ColorPill(
  {
    color,
    isAuto = false,
    isSelected = true,
    "aria-label": ariaLabel = color,
    ...props
  }: ColorPillProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <ColorPillRoot
      {...props}
      ref={ref}
      isAuto={isAuto}
      isSelected={isSelected}
      aria-label={ariaLabel}
    >
      <ColorPillContent style={{ backgroundColor: color }} />
    </ColorPillRoot>
  );
});

export default ColorPill;
