import type { HTMLAttributes, Ref } from "react";
import { forwardRef, useCallback } from "react";

import { ColorPill } from "metabase/common/components/ColorPill";

import { PopoverRoot } from "./ColorSelectorPopover.styled";

/**
 * A picker given named palette colors reports which one was chosen, so the
 * choice can be stored as a reference to the palette rather than a fixed value.
 * The name is opaque here; callers that care what it refers to (e.g. an
 * accent color key) narrow it on their end.
 */
export type ColorSelectorOption = string | { name: string; value: string };

type NormalizedOption = {
  name?: string;
  value: string;
};

const toNamedColor = (option: ColorSelectorOption): NormalizedOption =>
  typeof option === "string" ? { value: option } : option;

export interface ColorSelectorPopoverProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
> {
  value?: string;
  colors: ColorSelectorOption[];
  onChange?: (hexValue: string, colorName?: string) => void;
  onClose?: () => void;
}

export const ColorSelectorPopover = forwardRef(function ColorSelector(
  { value, colors, onChange, onClose, ...props }: ColorSelectorPopoverProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleSelect = useCallback(
    (hexValue: string, colorName?: string) => {
      onChange?.(hexValue, colorName);
      onClose?.();
    },
    [onChange, onClose],
  );

  return (
    <PopoverRoot {...props} ref={ref}>
      {colors.map(toNamedColor).map((option, index) => (
        <ColorPill
          key={index}
          color={option.value}
          isSelected={value === option.value}
          onSelect={(newValue) => handleSelect(newValue, option.name)}
        />
      ))}
    </PopoverRoot>
  );
});
