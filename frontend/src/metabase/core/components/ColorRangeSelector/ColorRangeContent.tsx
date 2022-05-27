import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import { ColorContent, ColorList } from "./ColorRangeSelector.styled";

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
    <ColorContent {...props} ref={ref}>
      <ColorList>
        {colors.map((option, index) => (
          <ColorPill key={index} color={option} />
        ))}
      </ColorList>
    </ColorContent>
  );
});

export default ColorSelectorContent;
