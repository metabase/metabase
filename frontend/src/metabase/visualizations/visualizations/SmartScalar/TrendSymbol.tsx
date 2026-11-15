import { Icon, rem } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type { ChangeColorName } from "./compute";

type TrendDirection = "arrow_up" | "arrow_down" | "no_change";

const DIRECTION_ICONS: Record<TrendDirection, IconName> = {
  arrow_up: "trend_up",
  arrow_down: "trend_down",
  no_change: "trend_flat",
};

const NO_CHANGE_OPACITY = 0.2;

interface TrendSymbolProps {
  direction: TrendDirection;
  colorName: ChangeColorName | undefined;
  size: number;
}

export const TrendSymbol = ({
  direction,
  colorName,
  size,
}: TrendSymbolProps) => {
  const isNoChange = direction === "no_change";

  return (
    <Icon
      name={DIRECTION_ICONS[direction]}
      size={rem(size)}
      color={isNoChange ? "text-primary" : (colorName ?? "feedback-positive")}
      opacity={isNoChange ? NO_CHANGE_OPACITY : undefined}
      data-testid="trend-symbol"
      data-direction={direction}
    />
  );
};
