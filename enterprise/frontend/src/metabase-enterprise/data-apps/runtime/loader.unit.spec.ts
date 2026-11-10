import { api, reinitializeRequestHandlers } from "metabase/api/client";
import { createDataAppSandbox } from "metabase-enterprise/data-apps/sandbox/sandbox";

import {
  DataAppBundleError,
  fetchDataAppBundleCode,
  instantiateDataAppBundle,
} from "./loader";

jest.mock("metabase-enterprise/data-apps/sandbox/sandbox", () => ({
  ...jest.requireActual("metabase-enterprise/data-apps/sandbox/sandbox"),
  createDataAppSandbox: jest.fn(),
}));

const ALLOWED_HOSTS_HEADER = "X-Metabase-Data-App-Allowed-Hosts";

const mockedCreateSandbox = jest.mocked(createDataAppSandbox);

describe("fetchDataAppBundleCode", () => {
  const originalFetch = global.fetch;

  const setup = (
    response: Response | Error,
    appResponse: Response = new Response(JSON.stringify({ id: 7 })),
  ) => {
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        const result = url.includes("/api/ee/apps/slug/")
          ? appResponse
          : response;

        return result instanceof Error
          ? Promise.reject(result)
          : Promise.resolve(result.clone());
      },
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
    "looks up the app by its encoded name, then requests its bundle by ID, with the Metabase client with cache disabled (embedded: %s)",
    async (embedded) => {
      const apiFetch = jest.spyOn(api, "fetch");
      const { fetchMock } = setup(new Response("CODE"));

      await fetchDataAppBundleCode("my app", { embedded });

      expect(apiFetch).toHaveBeenCalledTimes(2);
      expect(apiFetch).toHaveBeenNthCalledWith(1, {
        method: "GET",
        url: "/api/ee/apps/slug/my%20app",
        cache: "no-store",
      });
      expect(apiFetch).toHaveBeenNthCalledWith(2, {
        method: "GET",
        url: "/api/ee/apps/7/bundle",
        cache: "no-store",
      });

      const paths = fetchMock.mock.calls.map(([request]) => {
        if (!(request instanceof Request)) {
          throw new Error("expected an API request");
        }
        expect(new URL(request.url).search).toBe("");
        return new URL(request.url).pathname;
      });
      expect(paths).toEqual([
        "/api/ee/apps/slug/my%20app",
        "/api/ee/apps/7/bundle",
      ]);
    },
  );

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

  it.each<[number, string]>([
    [403, "You don't have access to this data app."],
    [
      404,
      'Data app "demo" was not found or is disabled. Check the app name in path.',
    ],
  ])(
    "reports embedded app lookup failures inside the runtime: %s",
    async (status, message) => {
      setup(new Response("CODE"), new Response("unavailable", { status }));

      await expect(
        fetchDataAppBundleCode("demo", { embedded: true }),
      ).rejects.toMatchObject({ status, message });
    },
  );

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
        realmHostUrl: "/api/ee/browser-sandboxing/sandbox-host",
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
