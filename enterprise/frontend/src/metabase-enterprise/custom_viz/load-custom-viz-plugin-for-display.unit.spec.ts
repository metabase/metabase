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

  it("resolves null for a non-custom display without hitting the plugin list", async () => {
    fetchMock.get(LIST_ROUTE, [PLUGIN]);
    const { dispatch, listCalls } = setup();

    const result = await loadCustomVizPluginForDisplay(dispatch, "table");

    expect(result).toBeNull();
    expect(listCalls()).toHaveLength(0);
  });

  it("resolves null when the plugin list request fails", async () => {
    fetchMock.get(LIST_ROUTE, 500);
    const { dispatch } = setup();

    const result = await loadCustomVizPluginForDisplay(dispatch, DISPLAY);

    expect(result).toBeNull();
  });

  it("resolves null and reports not-found when no plugin backs the display", async () => {
    fetchMock.get(LIST_ROUTE, []);
    const { dispatch } = setup();
    const onMessage = jest.fn();

    const result = await loadCustomVizPluginForDisplay(dispatch, DISPLAY, {
      onMessage,
    });

    expect(result).toBeNull();
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("no matching installed plugin"),
      }),
    );
  });

  it("resolves null and reports when the plugin bundle fails to load", async () => {
    fetchMock.get(LIST_ROUTE, [PLUGIN]);
    fetchMock.get(BUNDLE_ROUTE, 500);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { dispatch, bundleCalls } = setup();
    const onMessage = jest.fn();

    const result = await loadCustomVizPluginForDisplay(dispatch, DISPLAY, {
      onMessage,
    });

    expect(result).toBeNull();
    expect(bundleCalls()).toHaveLength(1);
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("currently unavailable"),
        }),
      );
    });
  });
});
