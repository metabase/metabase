import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import ColorSelectorPopover from "./ColorSelectorPopover";

export type ColorSelectorAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface ColorSelectorProps extends ColorSelectorAttributes {
  value: string;
  colors: string[];
  onChange?: (color: string) => void;
}

const ColorSelector = forwardRef(function ColorSelector(
  { value, colors, onChange, ...props }: ColorSelectorProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <ColorPill {...props} ref={ref} color={value} onClick={onClick} />
      )}
      popoverContent={
        <ColorSelectorPopover
          value={value}
          colors={colors}
          onChange={onChange}
        />
      }
    />
  );
});

export default ColorSelector;
