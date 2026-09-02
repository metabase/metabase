import type { CustomVisualization } from "custom-viz";
import type { ComponentType } from "react";

import type {
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import {
  createMockCustomVizPluginRuntime,
  createMockDatasetData,
} from "metabase-types/api/mocks";

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
      prefix: "custom-viz:demo-viz:",
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
        prefix: "custom-viz:demo-viz:",
        getUiName: () => "Demo",
      },
    );

    expect(() => checkRenderable?.([], {})).not.toThrow();
  });

  it("is always sensible without consulting the plugin", () => {
    const checkRenderable = jest.fn();
    const vizDef = createVizDef({ checkRenderable });

    const { isSensible } = applyDefaultVisualizationProps(COMPONENT, vizDef, {
      identifier: "custom:demo-viz",
      plugin: PLUGIN,
      prefix: "custom-viz:demo-viz:",
      getUiName: () => "Demo",
    });

    expect(isSensible?.(createMockDatasetData({}))).toBe(true);
    expect(checkRenderable).not.toHaveBeenCalled();
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
