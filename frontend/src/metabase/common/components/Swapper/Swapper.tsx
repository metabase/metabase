import cx from "classnames";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { forwardRef, useCallback, useState } from "react";

import { Box } from "metabase/ui";

import S from "./Swapper.module.css";

export interface SwapperProps extends HTMLAttributes<HTMLDivElement> {
  defaultElement?: ReactNode;
  swappedElement?: ReactNode;
  isSwapped?: boolean;
}

export const Swapper = forwardRef(function Swapper(
  { defaultElement, swappedElement, isSwapped = false, ...props }: SwapperProps,
  ref: Ref<HTMLDivElement>,
) {
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = isHovered || isSwapped;
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  return (
    <Box
      {...props}
      ref={ref}
      pos="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Box className={cx({ [S.scaledDown]: isSelected })}>{defaultElement}</Box>
      <Box
        className={cx({ [S.scaledDown]: !isSelected })}
        pos="absolute"
        inset={0}
      >
        {swappedElement}
      </Box>
    </Box>
  );
});
