import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import { ColorSelectorRoot } from "./ColorSelector.styled";

export interface ColorSelectorProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  color: string;
  colors: string[];
  onChange: (color: string) => void;
}

const ColorSelector = forwardRef(function ColorSelector(
  { color, colors, onChange, ...props }: ColorSelectorProps,
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
          onClick={() => onChange(option)}
        />
      ))}
    </ColorSelectorRoot>
  );
});

export default ColorSelector;
