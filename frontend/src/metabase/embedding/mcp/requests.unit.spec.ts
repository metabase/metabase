import fetchMock from "fetch-mock";

import {
  ApiClient,
  reinitializeRequestHandlers,
  setRefusedRequestHandler,
} from "metabase/api/client";

import { setMcpCredentialRefresher } from "./auth/credentialRefresh";
import { installMcpUiCredential } from "./auth/mcpUiAuth";
import {
  installMcpAppsRequestOverride,
  overrideRequestForMcpApps,
  setCurrentMcpQueryHandle,
} from "./requests";

describe("overrideRequestForMcpApps", () => {
  afterEach(() => {
    setCurrentMcpQueryHandle(null);
  });

  it.each([
    ["/api/dataset", "run"],
    ["/api/dataset/pivot", "pivot"],
    ["/api/dataset/query_metadata", "query_metadata"],
    ["/api/dataset/parameter/remapping", "parameter/remapping"],
  ])("sends %s to the current handle's %s route", async (url, route) => {
    setCurrentMcpQueryHandle("handle-1");

    await expect(
      overrideRequestForMcpApps({ method: "POST", url }),
    ).resolves.toEqual({ url: `/api/embed-mcp/queries/handle-1/${route}` });
  });

  it("leaves other requests alone", async () => {
    setCurrentMcpQueryHandle("handle-1");

    await expect(
      overrideRequestForMcpApps({ method: "GET", url: "/api/user/current" }),
    ).resolves.toBeUndefined();
    await expect(
      overrideRequestForMcpApps({ method: "GET", url: "/api/dataset" }),
    ).resolves.toBeUndefined();
  });

  it("leaves a query request alone before any handle is shown, so the server refuses it", async () => {
    await expect(
      overrideRequestForMcpApps({ method: "POST", url: "/api/dataset" }),
    ).resolves.toBeUndefined();
  });
});

describe("resending a refused iframe request", () => {
  const RUN_URL = "path:/api/embed-mcp/queries/handle-1/run";
  let refresher: jest.Mock;

  beforeEach(() => {
    setCurrentMcpQueryHandle("handle-1");
    installMcpUiCredential({ credential: "credential-1", sessionId: "s-1" });
    installMcpAppsRequestOverride();
    refresher = jest.fn(async () => {
      const auth = { credential: "credential-2", sessionId: "s-1" };
      installMcpUiCredential(auth);
      return auth;
    });
    setMcpCredentialRefresher(refresher);
  });

  afterEach(() => {
    setCurrentMcpQueryHandle(null);
    setMcpCredentialRefresher(null);
    setRefusedRequestHandler(null);
    reinitializeRequestHandlers();
    fetchMock.removeRoutes().clearHistory();
  });

  const credentialsSent = (route: string) =>
    fetchMock.callHistory
      .calls(route)
      .map((call) =>
        new Headers(call.options.headers).get("X-Metabase-Mcp-Ui-Auth"),
      );

  const refuseFirstCredential = (route: string) =>
    fetchMock.post(route, ({ options }) =>
      new Headers(options.headers).get("X-Metabase-Mcp-Ui-Auth") ===
      "credential-1"
        ? 401
        : { data: { rows: [] } },
    );

  const run = () =>
    new ApiClient().request({ method: "POST", url: "/api/dataset", body: {} });

  it("refreshes the credential once and resends the refused run with the new one", async () => {
    refuseFirstCredential(RUN_URL);

    await expect(run()).resolves.toEqual({ data: { rows: [] } });

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(credentialsSent(RUN_URL)).toEqual(["credential-1", "credential-2"]);
  });

  it("shares one refresh between two concurrent refusals, and resends both", async () => {
    refuseFirstCredential(RUN_URL);

    await expect(Promise.all([run(), run()])).resolves.toHaveLength(2);

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(credentialsSent(RUN_URL)).toEqual([
      "credential-1",
      "credential-1",
      "credential-2",
      "credential-2",
    ]);
  });

  it("leaves a refused request to any other route alone", async () => {
    fetchMock.get("path:/api/user/current", 401);

    await expect(
      new ApiClient().request({ method: "GET", url: "/api/user/current" }),
    ).rejects.toMatchObject({ status: 401 });

    expect(refresher).not.toHaveBeenCalled();
    expect(fetchMock.callHistory.calls("path:/api/user/current")).toHaveLength(
      1,
    );
  });
});
