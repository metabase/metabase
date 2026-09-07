import type { CustomVisualization } from "custom-viz";
import type { ComponentType } from "react";

import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import { createMockCustomVizPluginRuntime } from "metabase-types/api/mocks";

import { applyDefaultVisualizationProps } from "./custom-viz-common";

const PLUGIN = createMockCustomVizPluginRuntime();

const COMPONENT: ComponentType<
  VisualizationProps & VisualizationPassThroughProps
> = () => null;

describe("applyDefaultVisualizationProps", () => {
  it("wraps a plugin's checkRenderable", () => {
    const checkRenderable = jest.fn();
    const vizDef = createVizDef({ checkRenderable });

    applyDefaultVisualizationProps(COMPONENT, vizDef, {
      identifier: "custom:demo-viz",
      plugin: PLUGIN,
      getUiName: () => "Demo",
    }).checkRenderable?.([], {});

    expect(checkRenderable).toHaveBeenCalledTimes(1);
  });

  it("treats a bundle that omits checkRenderable as renderable, without throwing", () => {
    const vizDef = createVizDef({});

    const { checkRenderable } = applyDefaultVisualizationProps(
      COMPONENT,
      vizDef,
      {
        identifier: "custom:demo-viz",
        plugin: PLUGIN,
        getUiName: () => "Demo",
      },
    );

    expect(() => checkRenderable?.([], {})).not.toThrow();
  });
});

function createVizDef(
  overrides: Partial<CustomVisualization<Record<string, unknown>>>,
): CustomVisualization<Record<string, unknown>> {
  return {
    id: "demo",
    getName: () => "Demo",
    checkRenderable: () => undefined,
    mount: () => ({
      update: () => undefined,
      unmount: () => undefined,
    }),
    VisualizationComponent: () => null,
    ...overrides,
  };
}
