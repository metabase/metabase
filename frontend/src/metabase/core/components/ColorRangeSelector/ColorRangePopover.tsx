import React, {
  forwardRef,
  HTMLAttributes,
  Ref,
  useCallback,
  useState,
} from "react";
import { color } from "metabase/lib/colors";
import ColorPill from "metabase/core/components/ColorPill";
import ColorRangeToggle from "./ColorRangeToggle";
import {
  PopoverColorList,
  PopoverColorRangeList,
  PopoverDivider,
  PopoverRoot,
} from "./ColorRangePopover.styled";

export interface ColorRangeContentProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  initialValue: string[];
  colors: string[];
  ranges?: string[][];
  onChange?: (value: string[]) => void;
  onClose?: () => void;
}

const ColorSelectorContent = forwardRef(function ColorSelector(
  {
    initialValue,
    colors,
    ranges = [],
    onChange,
    onClose,
    ...props
  }: ColorRangeContentProps,
  ref: Ref<HTMLDivElement>,
) {
  const [value, setValue] = useState(initialValue);
  const handleChange = useCallback(
    (value: string[]) => {
      onChange?.(value);
      onClose?.();
    },
    [onChange, onClose],
  );

  const handleSelect = useCallback((value: string) => {
    setValue([color("white"), value]);
  }, []);

  return (
    <PopoverRoot {...props} ref={ref}>
      <PopoverColorList>
        {colors.map((color, index) => (
          <ColorPill
            key={index}
            color={color}
            isSelected={value.includes(color)}
            onSelect={handleSelect}
          />
        ))}
      </PopoverColorList>
      <ColorRangeToggle value={value} onChange={handleChange} />
      {ranges.length > 0 && <PopoverDivider />}
      <PopoverColorRangeList>
        {ranges?.map((range, index) => (
          <ColorRangeToggle key={index} value={range} onChange={handleChange} />
        ))}
      </PopoverColorRangeList>
    </PopoverRoot>
  );
});

export default ColorSelectorContent;
