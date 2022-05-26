import React, { forwardRef, HTMLAttributes, memo, Ref } from "react";
import { range } from "lodash";
import { getColorScale } from "metabase/lib/colors/scale";
import { ColorRangeItem, ColorRangeRoot } from "./ColorRange.styled";

export interface ColorRangeProps extends HTMLAttributes<HTMLDivElement> {
  colors: string[];
  sections?: number;
  quantile?: boolean;
}

const ColorRange = (
  { colors, sections = 5, quantile = false, ...props }: ColorRangeProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element => {
  const scale = getColorScale([0, sections - 1], colors, quantile);

  return (
    <ColorRangeRoot {...props} ref={ref}>
      {range(0, sections).map(section => (
        <ColorRangeItem
          key={section}
          style={{ backgroundColor: scale(section) }}
        />
      ))}
    </ColorRangeRoot>
  );
};

export default memo(forwardRef(ColorRange));
