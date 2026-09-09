import { useMantineTheme } from "metabase/ui";
import type { VisualizationProps } from "metabase/visualizations/types";

import { type CartesianCardSizeTier, getCartesianCardSizeTier } from "./sizing";

type UseCartesianSizeTierProps = Pick<
  VisualizationProps,
  "width" | "height" | "isDashboard" | "isQueryBuilder" | "dashcard"
>;

/**
 * Size tiers apply to actual dashboard cards only. Themes that customize the
 * cartesian chart padding keep their own layout.
 */
export function useCartesianSizeTier({
  width,
  height,
  isDashboard,
  isQueryBuilder,
  dashcard,
}: UseCartesianSizeTierProps): CartesianCardSizeTier | undefined {
  const theme = useMantineTheme();
  const isDashboardCard = isDashboard && dashcard != null;

  if (!isDashboardCard || isQueryBuilder || theme.other.cartesian.padding) {
    return undefined;
  }

  return getCartesianCardSizeTier(width, height);
}
