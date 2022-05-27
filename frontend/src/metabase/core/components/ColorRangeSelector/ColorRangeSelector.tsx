import React, { HTMLAttributes } from "react";
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

const ColorRangeSelector = ({
  value,
  colors,
  onChange,
}: ColorRangeSelectorProps) => {
  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <ColorRange colors={value} onClick={onClick} />
      )}
      popoverContent={<div />}
    />
  );
};

export default ColorRangeSelector;
