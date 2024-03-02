import type { HTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import type { PillSize } from "metabase/core/components/ColorPill";
import ColorPill from "metabase/core/components/ColorPill";

import ColorSelectorPopover from "./ColorSelectorPopover";

export type ColorSelectorAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "onSelect"
>;

export interface ColorSelectorProps extends ColorSelectorAttributes {
  value: string;
  colors: string[];
  pillSize?: PillSize;
  onChange?: (newValue: string) => void;
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
      popoverContent={({ closePopover }) => (
        <ColorSelectorPopover
          value={value}
          colors={colors}
          onChange={onChange}
          onClose={closePopover}
        />
      )}
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorSelector;
