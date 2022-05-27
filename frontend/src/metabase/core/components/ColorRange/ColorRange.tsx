import React, {
  forwardRef,
  MouseEvent,
  HTMLAttributes,
  Ref,
  useCallback,
  useMemo,
} from "react";
import { range } from "lodash";
import { getColorScale } from "metabase/lib/colors/scale";
import { ColorRangeItem, ColorRangeRoot } from "./ColorRange.styled";

export type ColorRangeAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onSelect"
>;

export interface ColorRangeProps extends ColorRangeAttributes {
  colors: string[];
  sections?: number;
  quantile?: boolean;
  onSelect?: (newColors: string[]) => void;
}

const ColorRange = forwardRef(function ColorRange(
  {
    colors,
    sections = 5,
    quantile = false,
    onClick,
    onSelect,
    ...props
  }: ColorRangeProps,
  ref: Ref<HTMLDivElement>,
) {
  const scale = useMemo(() => {
    return getColorScale([0, sections - 1], colors, quantile);
  }, [colors, sections, quantile]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      onClick?.(event);
      onSelect?.(colors);
    },
    [colors, onClick, onSelect],
  );

  return (
    <ColorRangeRoot {...props} ref={ref} onClick={handleClick}>
      {range(0, sections).map(section => (
        <ColorRangeItem
          key={section}
          style={{ backgroundColor: scale(section) }}
        />
      ))}
    </ColorRangeRoot>
  );
});

export default ColorRange;
