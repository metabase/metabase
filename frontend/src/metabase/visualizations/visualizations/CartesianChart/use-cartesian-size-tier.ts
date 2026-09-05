import { useMantineTheme } from "metabase/ui";
import type { DashcardSizeTier } from "metabase/visualizations/lib/dashcard-sizing";

/**
 * Themes that customize the cartesian chart padding keep their own layout
 * instead of the responsive dashboard card tiers.
 */
export function useCartesianSizeTier(
  sizeTier: DashcardSizeTier | undefined,
): DashcardSizeTier | undefined {
  const theme = useMantineTheme();
  return theme.other.cartesian.padding ? undefined : sizeTier;
}
