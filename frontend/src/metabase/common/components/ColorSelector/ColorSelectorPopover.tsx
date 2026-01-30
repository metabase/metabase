import type { HTMLAttributes, Ref } from "react";
import { forwardRef, useCallback } from "react";

import { ColorPill } from "metabase/common/components/ColorPill";

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
  const handleSelect = useCallback(
    (newValue: string) => {
      onChange?.(newValue);
      onClose?.();
    },
    [onChange, onClose],
  );

  return (
    <PopoverRoot {...props} ref={ref}>
      {colors.map((option, index) => (
        <ColorPill
          key={index}
          color={option}
          isSelected={value === option}
          onSelect={handleSelect}
        />
      ))}
    </PopoverRoot>
  );
});
