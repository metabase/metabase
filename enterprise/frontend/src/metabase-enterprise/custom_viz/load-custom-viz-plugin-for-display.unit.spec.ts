import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { Api } from "metabase/api";
import { createMockCustomVizPluginRuntime } from "metabase-types/api/mocks";

import { loadCustomVizPluginForDisplay } from "./custom-viz-plugins";

const PLUGIN = createMockCustomVizPluginRuntime({
  id: 901,
  identifier: "loader-demo-viz",
  bundle_url: "/api/ee/custom-viz-plugin/901/bundle",
});

const DISPLAY = "custom:loader-demo-viz";
const LIST_ROUTE = "path:/api/ee/custom-viz-plugin/list";
const BUNDLE_ROUTE = "path:/api/ee/custom-viz-plugin/901/bundle";

function setup() {
  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  const listCalls = () => fetchMock.callHistory.calls(LIST_ROUTE);
  const bundleCalls = () => fetchMock.callHistory.calls(BUNDLE_ROUTE);
  return { dispatch: store.dispatch, listCalls, bundleCalls };
}

describe("loadCustomVizPluginForDisplay", () => {
  afterEach(() => {
    fetchMock.removeRoutes().clearHistory();
    jest.restoreAllMocks();
  });

  it("resolves unavailable for a non-custom display without hitting the plugin list", async () => {
    fetchMock.get(LIST_ROUTE, [PLUGIN]);
    const { dispatch, listCalls } = setup();

    const result = await loadCustomVizPluginForDisplay(dispatch, "table");

    expect(result).toEqual({ status: "unavailable" });
    expect(listCalls()).toHaveLength(0);
  });

  it("resolves error and logs when the plugin list request fails", async () => {
    fetchMock.get(LIST_ROUTE, 500);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { dispatch } = setup();

    const result = await loadCustomVizPluginForDisplay(dispatch, DISPLAY);

    expect(result).toEqual({ status: "error" });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to look up the plugin"),
      expect.anything(),
    );
  });

  it("resolves unavailable and reports not-found when no plugin backs the display", async () => {
    fetchMock.get(LIST_ROUTE, []);
    const { dispatch } = setup();
    const onMessage = jest.fn();

    const result = await loadCustomVizPluginForDisplay(dispatch, DISPLAY, {
      onMessage,
    });

    expect(result).toEqual({ status: "unavailable" });
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("no matching installed plugin"),
      }),
    );
  });

  it("resolves unavailable and reports when the plugin bundle fails to load", async () => {
    fetchMock.get(LIST_ROUTE, [PLUGIN]);
    fetchMock.get(BUNDLE_ROUTE, 500);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { dispatch, bundleCalls } = setup();
    const onMessage = jest.fn();

    const result = await loadCustomVizPluginForDisplay(dispatch, DISPLAY, {
      onMessage,
    });

    expect(result).toEqual({ status: "unavailable" });
    expect(bundleCalls()).toHaveLength(1);
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("currently unavailable"),
        }),
      );
    });
  });

  it("shares a single in-flight load between concurrent callers", async () => {
    const plugin = createMockCustomVizPluginRuntime({
      id: 902,
      identifier: "dedup-demo-viz",
      bundle_url: "/api/ee/custom-viz-plugin/902/bundle",
    });
    const bundleRoute = "path:/api/ee/custom-viz-plugin/902/bundle";
    fetchMock.get(LIST_ROUTE, [plugin]);
    fetchMock.get(bundleRoute, 500);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { dispatch } = setup();

    const results = await Promise.all([
      loadCustomVizPluginForDisplay(dispatch, "custom:dedup-demo-viz"),
      loadCustomVizPluginForDisplay(dispatch, "custom:dedup-demo-viz"),
    ]);

    expect(results).toEqual([
      { status: "unavailable" },
      { status: "unavailable" },
    ]);
    expect(fetchMock.callHistory.calls(bundleRoute)).toHaveLength(1);
  });
});
