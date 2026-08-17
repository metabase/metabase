import { createMockCustomVizPluginRuntime } from "metabase-types/api/mocks";

import {
  reportUnavailableCustomVizPlugin,
  resetUnavailableCustomVizPluginReports,
} from "./unavailable-toast";

const FLUSH_DELAY_MS = 300;

const SDK_VERSION_WARNING = {
  type: "sdk-version-mismatch" as const,
  sdk_version: "1.0.0",
  tested_sdk_range: "2.x",
};

const warningToast = (message: string) => ({
  icon: "warning_triangle_filled",
  iconColor: "feedback-warning",
  message,
});

describe("reportUnavailableCustomVizPlugin", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    resetUnavailableCustomVizPluginReports();
    jest.useRealTimers();
  });

  it("shows a toast for a single unavailable plugin", () => {
    const onMessage = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ display_name: "Viz A" }),
      onMessage,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(
      warningToast('The "Viz A" visualization is currently unavailable.'),
    );
  });

  it("mentions the version mismatch for a single plugin with warnings", () => {
    const onMessage = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({
        display_name: "Viz A",
        warnings: [SDK_VERSION_WARNING],
      }),
      onMessage,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onMessage).toHaveBeenCalledWith(
      warningToast(
        'The "Viz A" visualization is currently unavailable. It was built for a different version and may need to be updated.',
      ),
    );
  });

  it("does not show a toast before the flush delay elapses", () => {
    const onMessage = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime(),
      onMessage,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS - 1);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("combines plugins reported within the window into one toast and sorts vizualizations by name", () => {
    const onMessage = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
      onMessage,
    );
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 2, display_name: "Viz A" }),
      onMessage,
    );
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 3, display_name: "Viz C" }),
      onMessage,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(
      warningToast(
        '3 visualizations are currently unavailable: "Viz A", "Viz B", "Viz C".',
      ),
    );
  });

  it("mentions the version mismatch when any combined plugin has warnings", () => {
    const onMessage = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
      onMessage,
    );
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({
        id: 2,
        display_name: "Viz A",
        warnings: [SDK_VERSION_WARNING],
      }),
      onMessage,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onMessage).toHaveBeenCalledWith(
      warningToast(
        '2 visualizations are currently unavailable: "Viz A", "Viz B". They may have been built for a different version and may need to be updated.',
      ),
    );
  });

  it("collapses reports of the same plugin into one entry", () => {
    const onMessage = jest.fn();
    const plugin = createMockCustomVizPluginRuntime({
      display_name: "Viz A",
    });

    reportUnavailableCustomVizPlugin(plugin, onMessage);
    reportUnavailableCustomVizPlugin(plugin, onMessage);
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(
      warningToast('The "Viz A" visualization is currently unavailable.'),
    );
  });

  it("extends the window while reports keep arriving", () => {
    const onMessage = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
      onMessage,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS - 100);
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 2, display_name: "Viz A" }),
      onMessage,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS - 100);

    expect(onMessage).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(
      warningToast(
        '2 visualizations are currently unavailable: "Viz A", "Viz B".',
      ),
    );
  });

  it("shows a new toast for plugins reported after a flush", () => {
    const onMessage = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
      onMessage,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 2, display_name: "Viz A" }),
      onMessage,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenLastCalledWith(
      warningToast('The "Viz A" visualization is currently unavailable.'),
    );
  });

  it("keeps collecting reports until a callback arrives", () => {
    const onMessage = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(jest.getTimerCount()).toBe(0);

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 2, display_name: "Viz A" }),
      onMessage,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(
      warningToast(
        '2 visualizations are currently unavailable: "Viz A", "Viz B".',
      ),
    );
  });

  it("uses the most recent onMessage callback for the whole batch", () => {
    const firstOnMessage = jest.fn();
    const secondOnMessage = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
      firstOnMessage,
    );
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 2, display_name: "Viz A" }),
      secondOnMessage,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(firstOnMessage).not.toHaveBeenCalled();
    expect(secondOnMessage).toHaveBeenCalledTimes(1);
  });
});
