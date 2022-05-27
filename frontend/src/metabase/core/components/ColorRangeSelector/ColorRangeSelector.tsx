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
  ranges?: string[][];
  onChange?: (value: string[]) => void;
}

const ColorRangeSelector = forwardRef(function ColorRangeSelector(
  { value, colors, ranges, onChange, ...props }: ColorRangeSelectorProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <ColorRange {...props} ref={ref} colors={value} onClick={onClick} />
      )}
      popoverContent={({ closePopover }) => (
        <ColorRangePopover
          value={value}
          colors={colors}
          ranges={ranges}
          onChange={onChange}
          onClose={closePopover}
        />
      )}
    />
  );
});

export default ColorRangeSelector;
