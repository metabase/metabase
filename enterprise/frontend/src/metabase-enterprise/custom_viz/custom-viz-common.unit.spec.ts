import type { CustomVisualization, CustomVisualizationMount } from "custom-viz";
import type { ComponentType } from "react";

import type {
  Visualization,
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import { createMockCustomVizPluginRuntime } from "metabase-types/api/mocks";

import { applyDefaultVisualizationProps } from "./custom-viz-common";

const PLUGIN = createMockCustomVizPluginRuntime();

const mount: CustomVisualizationMount = () => ({
  update: () => undefined,
  unmount: () => undefined,
});

function makeVizDef(
  overrides: Partial<CustomVisualization<Record<string, unknown>>>,
): CustomVisualization<Record<string, unknown>> {
  const vizDef: CustomVisualization<Record<string, unknown>> = {
    id: "demo",
    getName: () => "Demo",
    checkRenderable: () => undefined,
    mount,
    VisualizationComponent: () => null,
    ...overrides,
  };
  return vizDef;
}

function apply(
  vizDef: CustomVisualization<Record<string, unknown>>,
): Visualization {
  const Component: ComponentType<
    VisualizationProps & VisualizationPassThroughProps
  > = () => null;

  return applyDefaultVisualizationProps(Component, vizDef, {
    identifier: "custom:demo-viz",
    plugin: PLUGIN,
    prefix: "custom-viz:demo-viz:",
    getUiName: () => "Demo",
  });
}

describe("applyDefaultVisualizationProps", () => {
  it("wraps a plugin's checkRenderable", () => {
    const checkRenderable = jest.fn();

    apply(makeVizDef({ checkRenderable })).checkRenderable?.([], {});

    expect(checkRenderable).toHaveBeenCalledTimes(1);
  });

  it("treats a bundle that omits checkRenderable as renderable, without throwing", () => {
    const vizDef = makeVizDef({});
    // A hand-written or older bundle can violate the SDK type by omitting checkRenderable.
    delete (vizDef as { checkRenderable?: unknown }).checkRenderable;

    const { checkRenderable } = apply(vizDef);

    expect(() => checkRenderable?.([], {})).not.toThrow();
  });
});
