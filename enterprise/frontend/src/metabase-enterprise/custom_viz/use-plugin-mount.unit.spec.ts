import { renderHook } from "@testing-library/react";
import type { WidgetMountHandle } from "custom-viz";

import type { CustomVizPluginRuntime } from "metabase-types/api";
import { createMockCustomVizPluginRuntime } from "metabase-types/api/mocks";

import { usePluginMount } from "./use-plugin-mount";

type Props = { value: number };

function renderPluginMount(
  performMount: (container: Element, props: Props) => WidgetMountHandle<Props>,
  plugin: CustomVizPluginRuntime = createMockCustomVizPluginRuntime(),
) {
  const { rerender } = renderHook(
    ({ props }) => {
      const containerRef = usePluginMount(performMount, props, plugin);
      // usePluginMount only mounts once the ref is attached to an element.
      containerRef.current = document.createElement("div");
      return containerRef;
    },
    { initialProps: { props: { value: 1 } } },
  );

  return {
    update: (props: Props) => rerender({ props }),
  };
}

describe("usePluginMount", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("logs a mount error for the given plugin and rethrows it", () => {
    const error = new Error("mount failed");

    expect(() =>
      renderPluginMount(() => {
        throw error;
      }, createMockCustomVizPluginRuntime()),
    ).toThrow("mount failed");

    expect(consoleError).toHaveBeenCalledWith(
      'Failed to render plugin "My Viz":',
      error,
    );
  });

  it("logs the plugin's version warnings alongside the rethrown error", () => {
    expect(() =>
      renderPluginMount(
        () => {
          throw new Error("mount failed");
        },
        createMockCustomVizPluginRuntime({
          warnings: [
            {
              type: "sdk-version-mismatch",
              sdk_version: null,
              tested_sdk_range: "2.0",
            },
          ],
        }),
      ),
    ).toThrow("mount failed");

    expect(consoleError).toHaveBeenCalledWith(
      "The plugin has version warnings that may explain the failure:",
      "Built with SDK version 1.x, but this version of Metabase was tested with SDK 2.0.",
    );
  });

  it("logs an update error for the given plugin and rethrows it", () => {
    const error = new Error("update failed");
    const handle: WidgetMountHandle<Props> = {
      update: () => {
        throw error;
      },
      unmount: jest.fn(),
    };

    const { update } = renderPluginMount(
      () => handle,
      createMockCustomVizPluginRuntime(),
    );
    expect(consoleError).not.toHaveBeenCalled();

    expect(() => update({ value: 2 })).toThrow("update failed");

    expect(consoleError).toHaveBeenCalledWith(
      'Failed to render plugin "My Viz":',
      error,
    );
  });

  it("mounts and updates normally when nothing throws", () => {
    const mounted: Props[] = [];
    const updated: Props[] = [];

    const { update } = renderPluginMount((_container, props) => {
      mounted.push(props);
      return {
        update: (nextProps) => updated.push(nextProps),
        unmount: jest.fn(),
      };
    });
    update({ value: 2 });

    expect(mounted).toEqual([{ value: 1 }]);
    expect(updated).toEqual([{ value: 2 }]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
