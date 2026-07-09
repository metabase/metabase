import {
  DataAppBundleError,
  fetchDataAppBundleCode,
  instantiateDataAppBundle,
} from "./loader";
import { createDataAppSandbox } from "./sandbox";

jest.mock("./sandbox", () => ({
  ...jest.requireActual("./sandbox"),
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
          : Promise.resolve(response),
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    return { fetchMock };
  };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("requests the bundle endpoint with cache disabled and the name encoded", async () => {
    const { fetchMock } = setup(new Response("CODE"));

    await fetchDataAppBundleCode("my app");

    const [url, init] = fetchMock.mock.calls[0];

    expect(url).toContain("/api/apps/my%20app/bundle");
    expect(init).toEqual({ cache: "no-store" });
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
      });
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
    mockedCreateSandbox.mockReturnValue({
      evaluate: () => () => factoryResult,
    } as unknown as ReturnType<typeof createDataAppSandbox>);

    return {
      instantiate: () => instantiateDataAppBundle("code", "demo", window, []),
    };
  };

  afterEach(() => jest.clearAllMocks());

  it("returns the component and narrows providerProps to the allowed keys", () => {
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

    const loaded = instantiate();

    expect(loaded.component).toBe(component);
    expect(loaded.providerProps).toEqual({
      theme: { colors: {} },
      allowedCustomVisualizations: ["funnel"],
    });
  });

  it.each<unknown>([{ component: "not a function" }, null])(
    "throws when the factory returns %p",
    (factoryResult) => {
      const { instantiate } = setup(factoryResult);

      expect(instantiate).toThrow(/missing a `component` function/);
    },
  );
});
