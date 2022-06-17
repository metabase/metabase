import React, {
  forwardRef,
  HTMLAttributes,
  ReactNode,
  Ref,
  useCallback,
  useState,
} from "react";
import {
  SwapperDefaultElement,
  SwapperLayeredElement,
  SwapperRoot,
} from "./Swapper.styled";

export interface SwapperProps extends HTMLAttributes<HTMLDivElement> {
  defaultElement?: ReactNode;
  swappedElement?: ReactNode;
  isInitiallySwapped?: boolean;
}

const Swapper = forwardRef(function Swapper(
  {
    defaultElement,
    swappedElement,
    isInitiallySwapped = false,
    ...props
  }: SwapperProps,
  ref: Ref<HTMLDivElement>,
) {
  const [isSwapped, setIsSwapped] = useState(isInitiallySwapped);
  const handleMouseEnter = useCallback(() => setIsSwapped(true), []);
  const handleMouseLeave = useCallback(() => setIsSwapped(false), []);

  return (
    <SwapperRoot
      {...props}
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <SwapperDefaultElement isVisible={!isSwapped}>
        {defaultElement}
      </SwapperDefaultElement>
      <SwapperLayeredElement isVisible={isSwapped}>
        {swappedElement}
      </SwapperLayeredElement>
    </SwapperRoot>
  );
});

export default Swapper;
