import type { HTMLAttributes, Ref } from "react";
import { forwardRef, useCallback } from "react";

import { ColorPill } from "metabase/common/components/ColorPill";
import type {
  MetabaseAccentColorKey,
  NamedColor,
} from "metabase/ui/colors/types";

import { PopoverRoot } from "./ColorSelectorPopover.styled";

/**
 * A picker given named palette colors reports which one was chosen, so the
 * choice can be stored as a reference to the palette rather than a fixed value.
 */
export type ColorSelectorOption = string | NamedColor;

type NormalizedOption = {
  name?: MetabaseAccentColorKey;
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
  onChange?: (newValue: string, colorName?: string) => void;
  onClose?: () => void;
}

export const ColorSelectorPopover = forwardRef(function ColorSelector(
  { value, colors, onChange, onClose, ...props }: ColorSelectorPopoverProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleSelect = useCallback(
    (newValue: string, colorName?: string) => {
      onChange?.(newValue, colorName);
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
