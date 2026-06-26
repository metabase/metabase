import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { createMockDashboard } from "metabase-types/api/mocks";

import { Api } from "./api";
import {
  automagicDashboardsApi,
  hasUnsafeXraySubPath,
} from "./automagic-dashboards";

let activeStore: ReturnType<typeof getStore> | undefined;

function setup() {
  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  const xrayCalls = () =>
    fetchMock.callHistory.calls(XRAY_URL_REGEX, { method: "GET" });

  return { store, xrayCalls };
}

const XRAY_URL_REGEX = /\/api\/automagic-dashboards\//;

describe("hasUnsafeXraySubPath", () => {
  it.each([
    "table/3",
    "adhoc/eyJxdWVyeSI6e30/cell/eyJmaWx0ZXIiOltdfQ",
    "question/1/cell/abc/compare/table/2",
    "table/3?dashboard_load_id=x",
    // a `..` in the query string is not path traversal
    "table/3?next=../../secret",
  ])("treats legitimate subPath %p as safe", (subPath) => {
    expect(hasUnsafeXraySubPath(subPath)).toBe(false);
  });

  it.each([
    "table/3/../../../api/user/current",
    "../../foo",
    "..",
    "table/./3",
  ])("flags traversal subPath %p as unsafe", (subPath) => {
    expect(hasUnsafeXraySubPath(subPath)).toBe(true);
  });
});

describe("getXrayDashboard endpoint", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("issues the request for a safe subPath", async () => {
    fetchMock.get(XRAY_URL_REGEX, createMockDashboard());
    const { store, xrayCalls } = setup();

    const result = await store.dispatch(
      automagicDashboardsApi.endpoints.getXrayDashboard.initiate({
        subPath: "table/3",
      }),
    );

    expect(result.error).toBeUndefined();
    expect(xrayCalls()).toHaveLength(1);
  });

  it("rejects a traversal subPath without issuing a request", async () => {
    fetchMock.get(XRAY_URL_REGEX, createMockDashboard());
    const { store, xrayCalls } = setup();

    const result = await store.dispatch(
      automagicDashboardsApi.endpoints.getXrayDashboard.initiate({
        subPath: "table/3/../../../api/user/current",
      }),
    );

    expect(result.error).toBeDefined();
    expect(xrayCalls()).toHaveLength(0);
  });
});
