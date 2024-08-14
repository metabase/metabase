import type { HTMLAttributes, ReactNode, Ref } from "react";
import { forwardRef, useCallback, useState } from "react";

import {
  SwapperDefaultElement,
  SwapperLayeredElement,
  SwapperRoot,
} from "./Swapper.styled";

export interface SwapperProps extends HTMLAttributes<HTMLDivElement> {
  defaultElement?: ReactNode;
  swappedElement?: ReactNode;
  isSwapped?: boolean;
}

const Swapper = forwardRef(function Swapper(
  { defaultElement, swappedElement, isSwapped = false, ...props }: SwapperProps,
  ref: Ref<HTMLDivElement>,
) {
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = isHovered || isSwapped;
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  return (
    <SwapperRoot
      {...props}
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <SwapperDefaultElement isVisible={!isSelected}>
        {defaultElement}
      </SwapperDefaultElement>
      <SwapperLayeredElement isVisible={isSelected}>
        {swappedElement}
      </SwapperLayeredElement>
    </SwapperRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Swapper;
