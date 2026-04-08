import type { CustomVisualization } from "custom-viz/src/types";

import type { Visualization } from "metabase/visualizations/types/visualization";

/**
 * Assign properties derived from a vizDef onto a Visualization component
 * and merge in caller-specific overrides.
 */
export function applyDefaultVisualizationProps(
  Component: Visualization,
  vizDef: CustomVisualization<Record<string, unknown>>,
  overrides: Partial<Record<keyof Visualization, unknown>>,
) {
  Object.assign(Component, {
    settings: vizDef.settings ?? {},
    checkRenderable: vizDef.checkRenderable,
    noHeader: vizDef.noHeader ?? false,
    canSavePng: vizDef.canSavePng ?? false,
    hidden: false,
    ...overrides,
  } satisfies Partial<Record<keyof Visualization, unknown>>);
}
