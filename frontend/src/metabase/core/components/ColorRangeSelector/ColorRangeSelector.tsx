import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorRange from "metabase/core/components/ColorRange";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import ColorRangePopover from "./ColorRangePopover";

export type ColorRangeSelectorAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface ColorRangeSelectorProps extends ColorRangeSelectorAttributes {
  value: string[];
  colors: string[];
  onChange?: (value: string[]) => void;
}

const ColorRangeSelector = forwardRef(function ColorRangeSelector(
  { value, colors, onChange, ...props }: ColorRangeSelectorProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <ColorRange {...props} ref={ref} colors={value} onClick={onClick} />
      )}
      popoverContent={
        <ColorRangePopover value={value} colors={colors} onChange={onChange} />
      }
    />
  );
});

export default ColorRangeSelector;
