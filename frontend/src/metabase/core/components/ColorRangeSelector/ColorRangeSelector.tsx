import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorRange from "metabase/core/components/ColorRange";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

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
      popoverContent={<div />}
    />
  );
});

export default ColorRangeSelector;
