import React, { forwardRef, HTMLAttributes, Ref } from "react";
import { ColorPillContent, ColorPillRoot } from "./ColorPill.styled";

export interface ColorPillProps extends HTMLAttributes<HTMLDivElement> {
  color: string;
  isAuto?: boolean;
}

const ColorPill = forwardRef(function ColorPill(
  {
    color,
    isAuto = false,
    "aria-label": ariaLabel = color,
    ...props
  }: ColorPillProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <ColorPillRoot {...props} ref={ref} isAuto={isAuto} aria-label={ariaLabel}>
      <ColorPillContent style={{ backgroundColor: color }} />
    </ColorPillRoot>
  );
});

export default ColorPill;
