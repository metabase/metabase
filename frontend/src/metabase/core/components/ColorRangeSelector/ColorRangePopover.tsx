import React, {
  forwardRef,
  HTMLAttributes,
  Ref,
  useCallback,
  useState,
} from "react";
import { isEqual } from "lodash";
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
  colorRanges?: string[][];
  colorMapping?: Record<string, string[]>;
  quantile?: boolean;
  onChange?: (newValue: string[]) => void;
  onClose?: () => void;
}

const ColorSelectorContent = forwardRef(function ColorSelector(
  {
    initialValue,
    colors,
    colorRanges = [],
    colorMapping = getDefaultColorMapping(colors),
    quantile,
    onChange,
    onClose,
    ...props
  }: ColorRangeContentProps,
  ref: Ref<HTMLDivElement>,
) {
  const [value, setValue] = useState(initialValue);
  const { color, isInverted } = getColorSelection(value, colors, colorMapping);

  const handleChange = useCallback(
    (newValue: string[]) => {
      onChange?.(newValue);
      onClose?.();
    },
    [onChange, onClose],
  );

  const handleSelect = useCallback(
    (newColor: string) => {
      if (isInverted) {
        setValue([...colorMapping[newColor]].reverse());
      } else {
        setValue(colorMapping[newColor]);
      }
    },
    [isInverted, colorMapping],
  );

  return (
    <PopoverRoot {...props} ref={ref}>
      <PopoverColorList>
        {colors.map((value, index) => (
          <ColorPill
            key={index}
            color={value}
            isSelected={value === color}
            onSelect={handleSelect}
          />
        ))}
      </PopoverColorList>
      <ColorRangeToggle
        value={value}
        quantile={quantile}
        onChange={handleChange}
      />
      {colorRanges.length > 0 && <PopoverDivider />}
      <PopoverColorRangeList>
        {colorRanges?.map((range, index) => (
          <ColorRangeToggle
            key={index}
            value={range}
            quantile={quantile}
            onChange={handleChange}
          />
        ))}
      </PopoverColorRangeList>
    </PopoverRoot>
  );
});

const getColorSelection = (
  value: string[],
  colors: string[],
  colorMapping: Record<string, string[]>,
) => {
  return Object.entries(colorMapping).reduce(
    (selection, [color, range]) => {
      if (isEqual(value, range)) {
        return { color, isInverted: false };
      } else if (isEqual(value, [...range].reverse())) {
        return { color, isInverted: true };
      } else {
        return selection;
      }
    },
    { color: colors[0], isInverted: false },
  );
};

const getDefaultColorMapping = (colors: string[]) => {
  return Object.fromEntries(colors.map(color => [color, ["white", color]]));
};

export default ColorSelectorContent;
