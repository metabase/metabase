import React, { forwardRef, HTMLAttributes, Ref } from "react";
import ColorRange from "metabase/core/components/ColorRange";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import ColorRangePopover from "./ColorRangePopover";

export type ColorRangeSelectorAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "onSelect"
>;

export interface ColorRangeSelectorProps extends ColorRangeSelectorAttributes {
  value: string[];
  colors: string[];
  ranges?: string[][];
  quantile?: boolean;
  onChange?: (newValue: string[]) => void;
}

const ColorRangeSelector = forwardRef(function ColorRangeSelector(
  {
    value,
    colors,
    ranges,
    quantile,
    onChange,
    ...props
  }: ColorRangeSelectorProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <ColorRange
          {...props}
          ref={ref}
          colors={value}
          quantile={quantile}
          onClick={onClick}
        />
      )}
      popoverContent={({ closePopover }) => (
        <ColorRangePopover
          initialValue={value}
          colors={colors}
          ranges={ranges}
          quantile={quantile}
          onChange={onChange}
          onClose={closePopover}
        />
      )}
    />
  );
});

export default ColorRangeSelector;
