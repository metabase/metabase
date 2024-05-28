import type { MouseEvent, HTMLAttributes, Ref } from "react";
import { forwardRef, useCallback } from "react";

import { ColorPillContent, ColorPillRoot } from "./ColorPill.styled";
import type { PillSize } from "./types";

export type ColorPillAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onSelect"
>;

export interface ColorPillProps extends ColorPillAttributes {
  color: string;
  isAuto?: boolean;
  isSelected?: boolean;
  onSelect?: (newColor: string) => void;
  pillSize?: PillSize;
}

const ColorPill = forwardRef(function ColorPill(
  {
    color,
    isAuto = false,
    isSelected = true,
    "aria-label": ariaLabel = color,
    pillSize = "medium",
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
      pillSize={pillSize}
    >
      <ColorPillContent style={{ backgroundColor: color }} />
    </ColorPillRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(ColorPill, {
  Content: ColorPillContent,
  Root: ColorPillRoot,
});
