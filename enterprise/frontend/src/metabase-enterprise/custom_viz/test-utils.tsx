import type { CustomVisualization } from "custom-viz";
import type { ComponentType } from "react";

import { registerVisualization } from "metabase/visualizations";
import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import type { CustomVizDisplayType } from "metabase-types/api";

import { applyDefaultVisualizationProps } from "./custom-viz-common";

type PluginVisualization = CustomVisualization<Record<string, unknown>>;

export type RegisterMockCustomVizOpts = {
  display: CustomVizDisplayType;
  Component?: ComponentType<VisualizationProps & VisualizationPassThroughProps>;
  isSensible?: PluginVisualization["isSensible"];
};

/**
 * Registers a custom viz the same way a loaded plugin bundle would, minus the
 * sandbox: a plugin-shaped definition run through `applyDefaultVisualizationProps`.
 */
export function registerMockCustomViz({
  display,
  Component = () => null,
  isSensible,
}: RegisterMockCustomVizOpts) {
  const uiName = `Mock ${display}`;
  const visualization = applyDefaultVisualizationProps(
    Component,
    {
      id: display,
      getName: () => uiName,
      isSensible,
      checkRenderable: () => undefined,
      mount: () => ({ update: () => undefined, unmount: () => undefined }),
      VisualizationComponent: () => null,
    },
    { identifier: display, pluginId: 1, getUiName: () => uiName },
  );

  registerVisualization(visualization);

  return visualization;
}
