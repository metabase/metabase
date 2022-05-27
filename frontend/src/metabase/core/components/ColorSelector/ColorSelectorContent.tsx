import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import { ColorSelectorRoot } from "./ColorSelector.styled";

export interface ColorSelectorContentProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: string;
  colors: string[];
  onChange?: (value: string) => void;
}

const ColorSelectorContent = forwardRef(function ColorSelector(
  { value, colors, onChange, ...props }: ColorSelectorContentProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <ColorSelectorRoot {...props} ref={ref}>
      {colors.map((option, index) => (
        <ColorPill
          key={index}
          color={option}
          isSelected={value === option}
          onClick={() => onChange?.(option)}
        />
      ))}
    </ColorSelectorRoot>
  );
});

export default ColorSelectorContent;
