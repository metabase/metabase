import type { CustomVisualization } from "custom-viz/src/types";

import type { Visualization } from "metabase/visualizations/types/visualization";

/**
 * Assign properties derived from a vizDef onto a Visualization component
 * and merge in caller-specific overrides.
 */
export function applyDefaultVisualizationPrps(
  Component: Visualization,
  vizDef: CustomVisualization<Record<string, unknown>>,
  overrides: Partial<Record<keyof Visualization, unknown>>,
) {
  Object.assign(Component, {
    settings: vizDef.settings ?? {},
    isSensible: vizDef.isSensible,
    checkRenderable: vizDef.checkRenderable,
    noHeader: vizDef.noHeader ?? false,
    canSavePng: vizDef.canSavePng ?? false,
    ...overrides,
  } satisfies Partial<Record<keyof Visualization, unknown>>);
}
