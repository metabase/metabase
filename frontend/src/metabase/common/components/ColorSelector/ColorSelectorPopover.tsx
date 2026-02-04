import type { HTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import { ColorSelectorPanel } from "metabase/common/components/ColorSelectorPanel/ColorSelectorPanel";

import { PopoverRoot } from "./ColorSelectorPopover.styled";

export interface ColorSelectorPopoverProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: string;
  colors: string[];
  onChange?: (newValue: string) => void;
  onClose?: () => void;
}

export const ColorSelectorPopover = forwardRef(function ColorSelector(
  { value, colors, onChange, onClose, ...props }: ColorSelectorPopoverProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <PopoverRoot {...props} ref={ref}>
      <ColorSelectorPanel
        initalColor={value}
        onChange={onChange}
        onClose={onClose}
      />
    </PopoverRoot>
  );
});
