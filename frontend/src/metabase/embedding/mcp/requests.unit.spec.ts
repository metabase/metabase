import { setMcpCredentialRefresher } from "./auth/credentialRefresh";
import {
  overrideRequestForMcpApps,
  refreshOnRefusedIframeRequest,
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

describe("refreshOnRefusedIframeRequest", () => {
  afterEach(() => {
    setMcpCredentialRefresher(null);
  });

  it("gets a new credential when an iframe route refuses one, and only then", async () => {
    const refresher = jest.fn(async () => ({
      credential: "credential-2",
      sessionId: "session-1",
    }));
    setMcpCredentialRefresher(refresher);

    refreshOnRefusedIframeRequest("/api/user/current");
    expect(refresher).not.toHaveBeenCalled();

    refreshOnRefusedIframeRequest("/api/embed-mcp/queries/handle-1/run");
    refreshOnRefusedIframeRequest("/api/embed-mcp/queries/handle-1/pivot");
    expect(refresher).toHaveBeenCalledTimes(1);
  });
});
