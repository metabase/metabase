import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import { ColorSelectorRoot } from "./ColorSelector.styled";

export interface ColorSelectorContentProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  color?: string;
  colors: string[];
  onChange?: (color: string) => void;
}

const ColorSelectorContent = forwardRef(function ColorSelector(
  { color, colors, onChange, ...props }: ColorSelectorContentProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <ColorSelectorRoot {...props} ref={ref} colors={colors}>
      {colors.map((option, index) => (
        <ColorPill
          key={index}
          color={option}
          isBordered
          isSelected={color === option}
          onClick={() => onChange?.(option)}
        />
      ))}
    </ColorSelectorRoot>
  );
});

export default ColorSelectorContent;
