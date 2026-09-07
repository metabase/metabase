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
      },
    );

    expect(() => checkRenderable?.([], {})).not.toThrow();
  });

  it("uses the plugin's getName as the UI name", () => {
    const vizDef = createVizDef({ getName: () => "Localized demo" });

    const { getUiName } = applyDefaultVisualizationProps(COMPONENT, vizDef, {
      identifier: "custom:demo-viz",
      plugin: PLUGIN,
    });

    expect(getUiName()).toBe("Localized demo");
  });

  it("falls back to the manifest display name when getName is omitted", () => {
    const vizDef = createVizDef({});
    const plugin = createMockCustomVizPluginRuntime({
      display_name: "Manifest name",
    });

    const { getUiName } = applyDefaultVisualizationProps(COMPONENT, vizDef, {
      identifier: "custom:demo-viz",
      plugin,
    });

    expect(getUiName()).toBe("Manifest name");
  });
});

function createVizDef(
  overrides: Partial<CustomVisualization<Record<string, unknown>>>,
): CustomVisualization<Record<string, unknown>> {
  return {
    checkRenderable: () => undefined,
    mount: () => ({
      update: () => undefined,
      unmount: () => undefined,
    }),
    VisualizationComponent: () => null,
    ...overrides,
  };
}
