import { createContext } from "react";

export interface ChartAnimation {
  durationMs: number;
}

/**
 * Prototype: inside a provider, ECharts charts animate from the old data to the
 * new data when their data changes, instead of drawing the new chart at once.
 */
export const ChartAnimationContext = createContext<ChartAnimation | null>(null);
