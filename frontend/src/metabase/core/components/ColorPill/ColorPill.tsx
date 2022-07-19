import React, {
  forwardRef,
  MouseEvent,
  HTMLAttributes,
  Ref,
  useCallback,
} from "react";
import { ColorPillContent, ColorPillRoot } from "./ColorPill.styled";

export type ColorPillAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onSelect"
>;

export interface ColorPillProps extends ColorPillAttributes {
  color: string;
  isAuto?: boolean;
  isSelected?: boolean;
  onSelect?: (newColor: string) => void;
}

const ColorPill = forwardRef(function ColorPill(
  {
    color,
    isAuto = false,
    isSelected = true,
    "aria-label": ariaLabel = color,
    onClick,
    onSelect,
    ...props
  }: ColorPillProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      onClick?.(event);
      onSelect?.(color);
    },
    [color, onClick, onSelect],
  );

  return (
    <ColorPillRoot
      {...props}
      ref={ref}
      isAuto={isAuto}
      isSelected={isSelected}
      aria-label={ariaLabel}
      onClick={handleClick}
    >
      <ColorPillContent style={{ backgroundColor: color }} />
    </ColorPillRoot>
  );
});

export default ColorPill;
