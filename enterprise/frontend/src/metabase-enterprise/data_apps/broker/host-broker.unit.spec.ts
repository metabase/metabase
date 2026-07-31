import fetchMock from "fetch-mock";

import { setBasename } from "metabase/utils/basename";

import { handleBrokerRequest, safeRequestHeaders } from "./host-broker";
import type { BrokerRequestMessage } from "./protocol";

const request = (
  overrides: Partial<BrokerRequestMessage>,
): BrokerRequestMessage => ({
  id: 1,
  method: "GET",
  url: "/api/health",
  headers: {},
  body: null,
  ...overrides,
});

describe("safeRequestHeaders", () => {
  it("keeps the API headers and drops app-injected ones", () => {
    expect(
      safeRequestHeaders({
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Metabase-Locale": "en",
        "X-Evil-Injected": "1",
        "x-forwarded-host": "attacker.example.com",
      }),
    ).toEqual({
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Metabase-Locale": "en",
    });
  });
});

describe("handleBrokerRequest", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
    setBasename("");
  });

  // Endpoint scopes cover `/api` only, so anything else would reach the session
  // with nothing behind it. Which `/api` routes answer is the backend's call.
  it("refuses a non-API path without hitting the network", async () => {
    const res = await handleBrokerRequest(
      request({ method: "GET", url: "/auth/sso" }),
    );

    expect(res.status).toBe(403);
    expect(res.ok).toBe(false);
    expect(res.body).toContain("broker refused");
  });

  it("proxies an allowlisted request and strips the anti-CSRF token from the response", async () => {
    fetchMock.post("path:/api/dataset", {
      status: 200,
      body: { rows: [] },
      headers: {
        "content-type": "application/json",
        "X-Metabase-Anti-CSRF-Token": "super-secret",
      },
    });

    const res = await handleBrokerRequest(
      request({ method: "POST", url: "/api/dataset", body: "{}" }),
    );

    expect(res.ok).toBe(true);
    expect(res.headers["content-type"]).toContain("application/json");
    // The anti-CSRF token never reaches the untrusted app.
    expect(res.headers["x-metabase-anti-csrf-token"]).toBeUndefined();
  });

  it("stamps the data-app client marker, ignoring one the app supplies", async () => {
    fetchMock.post("path:/api/dataset", { status: 200, body: {} });

    await handleBrokerRequest(
      request({
        method: "POST",
        url: "/api/dataset",
        body: "{}",
        // A compromised app claiming to be something the backend confines less.
        headers: { "X-Metabase-Client": "embedding-sdk-react" },
      }),
    );

    const [call] = fetchMock.callHistory.calls();

    // The marker is what narrows the request to `data-apps:base` server-side.
    expect(call?.request?.headers.get("x-metabase-client")).toBe("data-app");
  });

  it("resolves the API prefix against the basename (subpath deploys)", async () => {
    setBasename("/analytics");
    fetchMock.post("path:/analytics/api/dataset", { status: 200, body: {} });

    const res = await handleBrokerRequest(
      request({ method: "POST", url: "/analytics/api/dataset", body: "{}" }),
    );

    expect(res.status).toBe(200);
  });
});
