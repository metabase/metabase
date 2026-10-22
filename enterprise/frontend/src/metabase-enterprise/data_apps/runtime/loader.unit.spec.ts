import {
  PLUGIN_API,
  api,
  reinitializeRequestHandlers,
} from "metabase/api/client";
import { createDataAppSandbox } from "metabase-enterprise/data_apps/sandbox/sandbox";

import {
  DataAppBundleError,
  fetchDataAppBundleCode,
  instantiateDataAppBundle,
} from "./loader";

jest.mock("metabase-enterprise/data_apps/sandbox/sandbox", () => ({
  ...jest.requireActual("metabase-enterprise/data_apps/sandbox/sandbox"),
  createDataAppSandbox: jest.fn(),
}));

const ALLOWED_HOSTS_HEADER = "X-Metabase-Data-App-Allowed-Hosts";

const mockedCreateSandbox = jest.mocked(createDataAppSandbox);

describe("fetchDataAppBundleCode", () => {
  const originalFetch = global.fetch;

  const setup = (response: Response | Error) => {
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        response instanceof Error
          ? Promise.reject(response)
          : Promise.resolve(response.clone()),
    );

    global.fetch = fetchMock;

    return { fetchMock };
  };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
    jest.restoreAllMocks();

    reinitializeRequestHandlers();
  });

  it.each([false, true])(
    "requests the bundle through the API client with cache disabled and the name encoded (embedded: %s)",
    async (embedded) => {
      const apiFetch = jest.spyOn(api, "fetch");
      const { fetchMock } = setup(new Response("CODE"));

      await fetchDataAppBundleCode("my app", { embedded });

      expect(apiFetch).toHaveBeenCalledWith({
        method: "GET",
        url: "/api/apps/my%20app/bundle",
        cache: "no-store",
      });

      const request = fetchMock.mock.calls[0][0];
      if (!(request instanceof Request)) {
        throw new Error("Expected an API client Request");
      }

      expect(new URL(request.url).pathname).toBe("/api/apps/my%20app/bundle");
      expect(new URL(request.url).search).toBe("");
    },
  );

  it("uses the API session handler for embedded bundles, including refreshed sessions", async () => {
    const apiFetch = jest.spyOn(api, "fetch");

    const { fetchMock } = setup(
      new Response("CODE", {
        headers: {
          "X-Metabase-Data-App-Content-Security-Policy": "default-src 'none';",
        },
      }),
    );
    let session = "first-session";
    PLUGIN_API.onBeforeRequestHandlers.getOrRefreshSessionHandler =
      async () => ({
        headers: { "X-Metabase-Session": session },
      });

    await expect(
      fetchDataAppBundleCode("sales", { embedded: true }),
    ).resolves.toMatchObject({
      code: "CODE",
      contentSecurityPolicy: "default-src 'none';",
    });

    const firstRequest = fetchMock.mock.calls[0][0];
    expect(firstRequest).toBeInstanceOf(Request);
    if (!(firstRequest instanceof Request)) {
      throw new Error("Expected an API client Request");
    }
    expect(apiFetch).toHaveBeenCalledWith({
      method: "GET",
      url: "/api/apps/sales/bundle",
      cache: "no-store",
    });
    expect(firstRequest.headers.get("X-Metabase-Session")).toBe(
      "first-session",
    );

    session = "refreshed-session";
    await fetchDataAppBundleCode("sales", { embedded: true });

    const refreshedRequest = fetchMock.mock.calls[1][0];
    if (!(refreshedRequest instanceof Request)) {
      throw new Error("Expected an API client Request");
    }
    expect(refreshedRequest.headers.get("X-Metabase-Session")).toBe(
      "refreshed-session",
    );
  });

  it.each<[string, string | undefined, string[]]>([
    [
      "a JSON array",
      JSON.stringify(["https://api.example.com", "https://*.acme.com"]),
      ["https://api.example.com", "https://*.acme.com"],
    ],
    ["absent", undefined, []],
    ["invalid JSON", "{", []],
    ["a non-array value", JSON.stringify({ nope: true }), []],
    [
      "mixed entries (non-strings dropped)",
      JSON.stringify(["https://ok.com", 42, null]),
      ["https://ok.com"],
    ],
  ])(
    "returns the code and parses allowed_hosts when the header is %s",
    async (_desc, header, expected) => {
      setup(
        new Response(
          "CODE",
          header === undefined
            ? undefined
            : { headers: { [ALLOWED_HOSTS_HEADER]: header } },
        ),
      );

      await expect(fetchDataAppBundleCode("demo")).resolves.toEqual({
        code: "CODE",
        allowedHosts: expected,
        contentSecurityPolicy: null,
      });
    },
  );

  it.each<[number, string]>([
    [403, "You don't have access to this data app."],
    [
      404,
      'Data app "demo" was not found or is disabled. Check the app name in path.',
    ],
    [409, "Failed to fetch data app bundle: HTTP 409"],
  ])(
    "reports embedded bundle failures inside the runtime: %s",
    async (status, message) => {
      setup(new Response("unavailable", { status }));

      await expect(
        fetchDataAppBundleCode("demo", { embedded: true }),
      ).rejects.toMatchObject({ status, message });
    },
  );

  it("reads the CSP alongside the bundle source and allowed hosts", async () => {
    setup(
      new Response("CODE", {
        headers: {
          "X-Metabase-Data-App-Allowed-Hosts": JSON.stringify([
            "https://api.example.com",
          ]),
          "X-Metabase-Data-App-Content-Security-Policy": "default-src 'none';",
        },
      }),
    );

    await expect(fetchDataAppBundleCode("demo")).resolves.toEqual({
      code: "CODE",
      allowedHosts: ["https://api.example.com"],
      contentSecurityPolicy: "default-src 'none';",
    });
  });

  it("throws a DataAppBundleError carrying the HTTP status on a non-2xx response", async () => {
    setup(new Response("nope", { status: 404 }));

    await expect(fetchDataAppBundleCode("demo")).rejects.toMatchObject({
      name: "DataAppBundleError",
      status: 404,
    });
  });

  it("throws a DataAppBundleError with no status when the request never reaches the server", async () => {
    setup(new Error("offline"));

    const error = await fetchDataAppBundleCode("demo").catch((e) => e);
    expect(error).toBeInstanceOf(DataAppBundleError);
    expect(error.status).toBeUndefined();
    expect(error.message).toMatch(/Failed to reach the server/);
  });
});

describe("instantiateDataAppBundle", () => {
  const setup = (factoryResult: unknown) => {
    // Sandbox creation is async — Near-Membrane defers setup to the realm
    // iframe's `load` event once `iframeSrc` is set.
    mockedCreateSandbox.mockResolvedValue({
      // @ts-expect-error - the factory result is deliberately untyped: these tests
      // feed the loader malformed values (`null`, a non-function `component`).
      evaluate: () => () => factoryResult,
    });

    return {
      instantiate: () => instantiateDataAppBundle("code", "demo", window, []),
    };
  };

  afterEach(() => jest.clearAllMocks());

  it("points the sandbox at the realm-host document", async () => {
    const { instantiate } = setup({ component: () => null });

    await instantiate();

    expect(mockedCreateSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        realmHostUrl: "/api/ee/near-membrane-plugin/sandbox-host",
      }),
    );
  });

  it("returns the component and narrows providerProps to the allowed keys", async () => {
    const component = () => null;
    const { instantiate } = setup({
      component,
      providerProps: {
        theme: { colors: {} },
        allowedCustomVisualizations: ["funnel"],
        // Not an allowed key — must be dropped.
        authConfig: { metabaseInstanceUrl: "https://evil" },
      },
    });

    const loaded = await instantiate();

    expect(loaded.component).toBe(component);
    expect(loaded.providerProps).toEqual({
      theme: { colors: {} },
      allowedCustomVisualizations: ["funnel"],
    });
  });

  it.each<unknown>([{ component: "not a function" }, null])(
    "throws when the factory returns %p",
    async (factoryResult) => {
      const { instantiate } = setup(factoryResult);

      await expect(instantiate()).rejects.toThrow(
        /missing a `component` function/,
      );
    },
  );
});
