import type { HTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import ColorRange from "metabase/core/components/ColorRange";

import ColorRangePopover from "./ColorRangePopover";

export type ColorRangeSelectorAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "onSelect"
>;

export interface ColorRangeSelectorProps extends ColorRangeSelectorAttributes {
  value: string[];
  colors: string[];
  colorRanges?: string[][];
  colorMapping?: Record<string, string[]>;
  isQuantile?: boolean;
  onChange?: (newValue: string[]) => void;
}

const ColorRangeSelector = forwardRef(function ColorRangeSelector(
  {
    value,
    colors,
    colorRanges,
    colorMapping,
    isQuantile,
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
          isQuantile={isQuantile}
          onClick={onClick}
          role="button"
        />
      )}
      popoverContent={({ closePopover }) => (
        <ColorRangePopover
          initialValue={value}
          colors={colors}
          colorRanges={colorRanges}
          colorMapping={colorMapping}
          isQuantile={isQuantile}
          onChange={onChange}
          onClose={closePopover}
        />
      )}
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorRangeSelector;
