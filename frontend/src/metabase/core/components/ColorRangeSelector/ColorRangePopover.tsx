import React, { forwardRef, HTMLAttributes, Ref, useCallback } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import ColorRangeToggle from "./ColorRangeToggle";
import {
  PopoverRoot,
  PopoverColorList,
  PopoverDivider,
  PopoverColorRangeList,
} from "./ColorRangePopover.styled";

export interface ColorRangeContentProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: string[];
  colors: string[];
  ranges?: string[][];
  onChange?: (value: string[]) => void;
  onClose?: () => void;
}

const ColorSelectorContent = forwardRef(function ColorSelector(
  {
    value,
    colors,
    ranges = [],
    onChange,
    onClose,
    ...props
  }: ColorRangeContentProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleChange = useCallback(
    (value: string[]) => {
      onChange?.(value);
      onClose?.();
    },
    [onChange, onClose],
  );

  return (
    <PopoverRoot {...props} ref={ref}>
      <PopoverColorList>
        {colors.map((option, index) => (
          <ColorPill key={index} color={option} />
        ))}
      </PopoverColorList>
      <PopoverDivider />
      <PopoverColorRangeList>
        {ranges?.map((range, index) => (
          <ColorRangeToggle key={index} value={range} onChange={handleChange} />
        ))}
      </PopoverColorRangeList>
    </PopoverRoot>
  );
});

export default ColorSelectorContent;
