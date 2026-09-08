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
      prefix: "custom-viz:demo-viz:",
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
      },
    );

    expect(() => checkRenderable?.([], {})).not.toThrow();
  });

  it("uses the plugin's getName as the UI name", () => {
    const vizDef = createVizDef({ getName: () => "Localized demo" });

    const { getUiName } = applyDefaultVisualizationProps(COMPONENT, vizDef, {
      identifier: "custom:demo-viz",
      plugin: PLUGIN,
      prefix: "custom-viz:demo-viz:",
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
      prefix: "custom-viz:demo-viz:",
    });

    expect(getUiName()).toBe("Manifest name");
  });

  it("falls back to the manifest display name when getName returns a non-string", () => {
    // plugin code is untyped at runtime
    const vizDef = createVizDef({ getName: () => 42 as unknown as string });
    const plugin = createMockCustomVizPluginRuntime({
      display_name: "Manifest name",
    });

    const { getUiName } = applyDefaultVisualizationProps(COMPONENT, vizDef, {
      identifier: "custom:demo-viz",
      plugin,
      prefix: "custom-viz:demo-viz:",
    });

    expect(getUiName()).toBe("Manifest name");
  });

  it("falls back to the manifest display name when getName returns a blank string", () => {
    const vizDef = createVizDef({ getName: () => "  " });
    const plugin = createMockCustomVizPluginRuntime({
      display_name: "Manifest name",
    });

    const { getUiName } = applyDefaultVisualizationProps(COMPONENT, vizDef, {
      identifier: "custom:demo-viz",
      plugin,
      prefix: "custom-viz:demo-viz:",
    });

    expect(getUiName()).toBe("Manifest name");
  });

  it("resolves the UI name once at load time so a throwing getName fails the plugin load", () => {
    const getName = jest.fn(() => {
      throw new Error("boom");
    });
    const vizDef = createVizDef({ getName });

    expect(() =>
      applyDefaultVisualizationProps(COMPONENT, vizDef, {
        identifier: "custom:demo-viz",
        plugin: PLUGIN,
        prefix: "custom-viz:demo-viz:",
      }),
    ).toThrow("boom");
    expect(getName).toHaveBeenCalledTimes(1);
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
