import React, {
  forwardRef,
  HTMLAttributes,
  Ref,
  useCallback,
  useMemo,
  useState,
} from "react";
import { isEqual, toPairs } from "lodash";
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
  isQuantile?: boolean;
  onChange?: (newValue: string[]) => void;
  onClose?: () => void;
}

const ColorSelectorContent = forwardRef(function ColorSelector(
  {
    initialValue,
    colors,
    colorRanges = [],
    colorMapping: customColorMapping,
    isQuantile,
    onChange,
    onClose,
    ...props
  }: ColorRangeContentProps,
  ref: Ref<HTMLDivElement>,
) {
  const colorMapping = useMemo(() => {
    return customColorMapping ?? getDefaultColorMapping(colors);
  }, [colors, customColorMapping]);

  const [color, setColor] = useState(() =>
    getDefaultColor(initialValue, colors, colorMapping),
  );

  const [isInverted, setIsInverted] = useState(() =>
    getDefaultInverted(initialValue, colors, colorMapping),
  );

  const colorRange = useMemo(() => {
    return getColorRange(color, colorMapping, isInverted);
  }, [color, colorMapping, isInverted]);

  const handleChange = useCallback(
    (newValue: string[]) => {
      onChange?.(newValue);
      onClose?.();
    },
    [onChange, onClose],
  );

  return (
    <PopoverRoot {...props} ref={ref}>
      <PopoverColorList>
        {colors.map((value, index) => (
          <ColorPill
            key={index}
            color={value}
            isSelected={value === color}
            onSelect={setColor}
          />
        ))}
      </PopoverColorList>
      <ColorRangeToggle
        value={colorRange}
        isInverted={isInverted}
        isQuantile={isQuantile}
        onSelect={handleChange}
        onToggle={setIsInverted}
      />
      {colorRanges.length > 0 && <PopoverDivider />}
      <PopoverColorRangeList>
        {colorRanges?.map((range, index) => (
          <ColorRangeToggle
            key={index}
            value={range}
            isQuantile={isQuantile}
            onSelect={handleChange}
          />
        ))}
      </PopoverColorRangeList>
    </PopoverRoot>
  );
});

const getColorRange = (
  color: string,
  colorMapping: Record<string, string[]>,
  isInverted: boolean,
) => {
  if (isInverted) {
    return [...colorMapping[color]].reverse();
  } else {
    return colorMapping[color];
  }
};

const getDefaultColor = (
  value: string[],
  colors: string[],
  colorMapping: Record<string, string[]>,
) => {
  return Object.entries(colorMapping).reduce((selection, [color, range]) => {
    if (isEqual(value, range)) {
      return color;
    } else if (isEqual(value, [...range].reverse())) {
      return color;
    } else {
      return selection;
    }
  }, colors[0]);
};

const getDefaultInverted = (
  value: string[],
  colors: string[],
  colorMapping: Record<string, string[]>,
) => {
  return Object.values(colorMapping).reduce((selection, range) => {
    if (isEqual(value, [...range].reverse())) {
      return true;
    } else {
      return selection;
    }
  }, false);
};

const getDefaultColorMapping = (colors: string[]) => {
  return Object.fromEntries(colors.map(color => [color, ["white", color]]));
};

export default ColorSelectorContent;
