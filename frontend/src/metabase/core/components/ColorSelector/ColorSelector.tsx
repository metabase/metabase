import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import ColorSelectorContent from "./ColorSelectorContent";

export type ColorSelectorAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface ColorSelectorProps extends ColorSelectorAttributes {
  color: string;
  colors: string[];
  onChange?: (color: string) => void;
}

const ColorSelector = forwardRef(function ColorSelector(
  { color, colors, onChange, ...props }: ColorSelectorProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <ColorPill {...props} ref={ref} color={color} onClick={onClick} />
      )}
      popoverContent={
        <ColorSelectorContent
          color={color}
          colors={colors}
          onChange={onChange}
        />
      }
    />
  );
});

export default ColorSelector;
