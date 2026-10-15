import { useEffect } from "react";
import { useSet } from "react-use";

import type { LegendPosition } from "metabase-types/api";

const NONE = new Set<never>();

/**
 * Series the user hid through the legend. Turning the legend off brings them
 * all back, since the legend is the only control that hides them.
 */
export function useLegendHiddenSeries<Key>(
  legendPosition: LegendPosition | undefined,
): [hiddenSeries: Set<Key>, toggleSeries: (key: Key) => void] {
  const [hiddenSeries, { toggle, reset }] = useSet<Key>();
  const isLegendOff = legendPosition === "off";

  useEffect(() => {
    if (isLegendOff) {
      reset();
    }
  }, [isLegendOff, reset]);

  return [isLegendOff ? NONE : hiddenSeries, toggle];
}
