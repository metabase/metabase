import type { CustomVisualization } from "custom-viz/src/types";

import type {
  Visualization,
  VisualizationIconComponent,
} from "metabase/visualizations/types/visualization";

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
    iconDarkUrl?: string | undefined;
    IconComponent?: VisualizationIconComponent | undefined;
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
    ...settings,
  } satisfies Partial<Record<keyof Visualization, unknown>>);
}
