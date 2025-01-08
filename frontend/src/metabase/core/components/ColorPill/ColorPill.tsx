import cx from "classnames";
import type { HTMLAttributes, MouseEvent } from "react";
import { useCallback } from "react";

import CS from "metabase/css/core/index.css";
import { Box, Center } from "metabase/ui";

import ColorPillS from "./ColorPill.module.css";
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
  "data-testid"?: string;
}

export const ColorPill = ({
  color,
  isAuto = false,
  isSelected = true,
  "aria-label": ariaLabel = color,
  pillSize = "medium",
  onClick,
  onSelect,
  "data-testid": dataTestId,
}: ColorPillProps) => {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      onClick?.(event);
      onSelect?.(color);
    },
    [color, onClick, onSelect],
  );

  return (
    <Center
      data-testid={dataTestId}
      aria-label={ariaLabel}
      role="button"
      onClick={handleClick}
      className={cx(ColorPillS.ColorPill, CS.flexNoShrink, {
        [ColorPillS.Small]: pillSize === "small",
        [ColorPillS.Medium]: pillSize === "medium",
        [ColorPillS.Selected]: isSelected,
        [ColorPillS.Auto]: isAuto,
      })}
    >
      <Box bg={color} w="100%" h="100%" style={{ borderRadius: "50%" }}></Box>
    </Center>
  );
};
