import fetchMock from "fetch-mock";

import {
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { initAuth } from "embedding-sdk-bundle/store/auth";
import {
  PLUGIN_API,
  api,
  reinitializeRequestHandlers,
} from "metabase/api/client";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import "embedding-sdk-ee/auth";

describe("data app API-key authentication", () => {
  const originalHandlers = { ...PLUGIN_API.onBeforeRequestHandlers };

  afterEach(() => {
    Object.assign(PLUGIN_API.onBeforeRequestHandlers, originalHandlers);
  });

  it("uses the API key for bundle, query, and action requests without SSO", async () => {
    reinitializeRequestHandlers();
    setupCurrentUserEndpoint(createMockUser());
    setupPropertiesEndpoints(createMockSettings());
    fetchMock.get("path:/api/ee/apps/sales/bundle", {
      body: "BUNDLE",
      headers: { "Content-Type": "application/javascript" },
    });
    fetchMock.post("path:/api/dataset", { data: { rows: [] } });
    fetchMock.post("path:/api/action/1/execute", { "rows-affected": 1 });

    const store = getSdkStore();
    await store
      .dispatch(
        initAuth({
          metabaseInstanceUrl: "https://metabase.example.com",
          apiKey: "development-key",
          isLocalHost: true,
        }),
      )
      .unwrap();

    const bundle = await api.fetch({
      method: "GET",
      url: "/api/ee/apps/sales/bundle",
    });
    expect(await bundle.text()).toBe("BUNDLE");

    await api.fetch({
      method: "POST",
      url: "/api/dataset",
      body: { query: {} },
    });
    await api.fetch({
      method: "POST",
      url: "/api/action/1/execute",
      body: { parameters: {} },
    });

    const requests = fetchMock.callHistory.calls();
    expect(requests.map(({ url }) => new URL(url).pathname)).toEqual([
      "/api/user/current",
      "/api/session/properties",
      "/api/ee/apps/sales/bundle",
      "/api/dataset",
      "/api/action/1/execute",
    ]);

    for (const request of requests) {
      expect(new Headers(request.options.headers).get("X-Api-Key")).toBe(
        "development-key",
      );
      expect(request.url).not.toContain("development-key");
    }
  });
});
