import type { CustomVisualization } from "custom-viz";

import type { Visualization } from "metabase/visualizations/types/visualization";

/**
 * Assign properties derived from a vizDef onto a Visualization component
 * and merge in caller-specific overrides.
 */
export function applyDefaultVisualizationProps(
  Component: Visualization,
  vizDef: CustomVisualization<Record<string, unknown>>,
  settings: {
    identifier: string;
    getUiName: () => string;
    iconUrl?: string | undefined;
    isDev?: boolean;
  },
) {
  Object.assign(Component, {
    settings: vizDef.settings ?? {},
    checkRenderable: vizDef.checkRenderable,
    noHeader: vizDef.noHeader ?? false,
    canSavePng: vizDef.canSavePng ?? false,
    hidden: false,
    minSize: vizDef.minSize,
    defaultSize: vizDef.defaultSize,
    isDev: settings.isDev,
    ...settings,
  } satisfies Partial<Record<keyof Visualization, unknown>>);
}
