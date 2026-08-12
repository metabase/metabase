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

describe("reportUnavailableCustomVizPlugin", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    resetUnavailableCustomVizPluginReports();
    jest.useRealTimers();
  });

  it("shows a toast for a single unavailable plugin", () => {
    const onInfo = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ display_name: "Viz A" }),
      onInfo,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onInfo).toHaveBeenCalledTimes(1);
    expect(onInfo).toHaveBeenCalledWith(
      'The "Viz A" visualization is currently unavailable.',
    );
  });

  it("mentions the version mismatch for a single plugin with warnings", () => {
    const onInfo = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({
        display_name: "Viz A",
        warnings: [SDK_VERSION_WARNING],
      }),
      onInfo,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onInfo).toHaveBeenCalledWith(
      'The "Viz A" visualization is currently unavailable. It was built for a different version and may need to be updated.',
    );
  });

  it("does not show a toast before the flush delay elapses", () => {
    const onInfo = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime(),
      onInfo,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS - 1);

    expect(onInfo).not.toHaveBeenCalled();
  });

  it("combines plugins reported within the window into one toast and sorts vizualizations by name", () => {
    const onInfo = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
      onInfo,
    );
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 2, display_name: "Viz A" }),
      onInfo,
    );
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 3, display_name: "Viz C" }),
      onInfo,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onInfo).toHaveBeenCalledTimes(1);
    expect(onInfo).toHaveBeenCalledWith(
      '3 visualizations are currently unavailable: "Viz A", "Viz B", "Viz C".',
    );
  });

  it("mentions the version mismatch when any combined plugin has warnings", () => {
    const onInfo = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
      onInfo,
    );
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({
        id: 2,
        display_name: "Viz A",
        warnings: [SDK_VERSION_WARNING],
      }),
      onInfo,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onInfo).toHaveBeenCalledWith(
      '2 visualizations are currently unavailable: "Viz A", "Viz B". They may have been built for a different version and may need to be updated.',
    );
  });

  it("collapses reports of the same plugin into one entry", () => {
    const onInfo = jest.fn();
    const plugin = createMockCustomVizPluginRuntime({
      display_name: "Viz A",
    });

    reportUnavailableCustomVizPlugin(plugin, onInfo);
    reportUnavailableCustomVizPlugin(plugin, onInfo);
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onInfo).toHaveBeenCalledTimes(1);
    expect(onInfo).toHaveBeenCalledWith(
      'The "Viz A" visualization is currently unavailable.',
    );
  });

  it("extends the window while reports keep arriving", () => {
    const onInfo = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
      onInfo,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS - 100);
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 2, display_name: "Viz A" }),
      onInfo,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS - 100);

    expect(onInfo).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);

    expect(onInfo).toHaveBeenCalledTimes(1);
    expect(onInfo).toHaveBeenCalledWith(
      '2 visualizations are currently unavailable: "Viz A", "Viz B".',
    );
  });

  it("shows a new toast for plugins reported after a flush", () => {
    const onInfo = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
      onInfo,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 2, display_name: "Viz A" }),
      onInfo,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onInfo).toHaveBeenCalledTimes(2);
    expect(onInfo).toHaveBeenLastCalledWith(
      'The "Viz A" visualization is currently unavailable.',
    );
  });

  it("keeps collecting reports until a callback arrives", () => {
    const onInfo = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(jest.getTimerCount()).toBe(0);

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 2, display_name: "Viz A" }),
      onInfo,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(onInfo).toHaveBeenCalledTimes(1);
    expect(onInfo).toHaveBeenCalledWith(
      '2 visualizations are currently unavailable: "Viz A", "Viz B".',
    );
  });

  it("uses the most recent onInfo callback for the whole batch", () => {
    const firstOnInfo = jest.fn();
    const secondOnInfo = jest.fn();

    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 1, display_name: "Viz B" }),
      firstOnInfo,
    );
    reportUnavailableCustomVizPlugin(
      createMockCustomVizPluginRuntime({ id: 2, display_name: "Viz A" }),
      secondOnInfo,
    );
    jest.advanceTimersByTime(FLUSH_DELAY_MS);

    expect(firstOnInfo).not.toHaveBeenCalled();
    expect(secondOnInfo).toHaveBeenCalledTimes(1);
  });
});
