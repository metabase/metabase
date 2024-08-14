import type { MouseEvent, HTMLAttributes, Ref } from "react";
import { forwardRef, useCallback, useMemo } from "react";
import _ from "underscore";

import { getColorScale } from "metabase/lib/colors/scales";

import { ColorRangeItem, ColorRangeRoot } from "./ColorRange.styled";

export type ColorRangeAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onSelect"
>;

export interface ColorRangeProps extends ColorRangeAttributes {
  colors: string[];
  sections?: number;
  isQuantile?: boolean;
  onSelect?: (newColors: string[]) => void;
}

const ColorRange = forwardRef(function ColorRange(
  {
    colors,
    sections = 5,
    isQuantile = false,
    onClick,
    onSelect,
    ...props
  }: ColorRangeProps,
  ref: Ref<HTMLDivElement>,
) {
  const scale = useMemo(() => {
    return getColorScale([0, sections - 1], colors, isQuantile);
  }, [colors, sections, isQuantile]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      onClick?.(event);
      onSelect?.(colors);
    },
    [colors, onClick, onSelect],
  );

  return (
    <ColorRangeRoot {...props} ref={ref} onClick={handleClick}>
      {_.range(0, sections).map(section => (
        <ColorRangeItem
          key={section}
          style={{ backgroundColor: scale(section) }}
        />
      ))}
    </ColorRangeRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorRange;
