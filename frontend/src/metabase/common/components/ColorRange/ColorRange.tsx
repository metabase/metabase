import cx from "classnames";
import type { MouseEvent, Ref } from "react";
import { forwardRef, useCallback, useMemo } from "react";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { getColorScale } from "metabase/lib/colors/scales";
import { Box, Flex, type FlexProps } from "metabase/ui";

export interface ColorRangeProps extends Omit<FlexProps, "onSelect"> {
  colors: string[];
  sections?: number;
  isQuantile?: boolean;
  onSelect?: (newColors: string[]) => void;
}

export const ColorRange = forwardRef(function ColorRange(
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
    <Flex
      {...props}
      ref={ref}
      onClick={handleClick}
      h="2rem"
      className={cx(
        CS.bordered,
        CS.rounded,
        CS.cursorPointer,
        CS.overflowHidden,
        props.className,
      )}
    >
      {_.range(0, sections).map((section) => (
        <>
          {/* @ts-expect-error color range needs access to arbitrary color values */}
          <Box key={section} flex="1" bg={scale(section)} />
        </>
      ))}
    </Flex>
  );
});
