import fetchMock from "fetch-mock";

import {
  DevServerError,
  fetchDevServerBundle,
  fetchDevServerManifest,
  getDevServerSseUrl,
  getDevServerUrl,
} from "./dev-server";

function errorKind(error: unknown) {
  return error instanceof DevServerError ? error.kind : error;
}

const DEV_URL = "http://localhost:5174";

describe("dev server URLs", () => {
  it("joins paths onto the configured origin", () => {
    expect(getDevServerUrl(DEV_URL, "index.js")).toBe(
      "http://localhost:5174/index.js",
    );
    expect(getDevServerSseUrl(DEV_URL)).toBe("http://localhost:5174/__sse");
  });

  it("tolerates a trailing slash without doubling it", () => {
    expect(getDevServerUrl("http://localhost:5174/", "index.js")).toBe(
      "http://localhost:5174/index.js",
    );
  });

  it.each([
    ["bundle", getDevServerUrl(DEV_URL, "index.js")],
    ["manifest", getDevServerUrl(DEV_URL, "metabase-plugin.json")],
    ["sse", getDevServerSseUrl(DEV_URL)],
  ])("builds the %s URL with no query string", (_name, url) => {
    expect(url).not.toContain("?");
  });
});

describe("fetchDevServerBundle", () => {
  it("returns the bundle source from the dev server", async () => {
    fetchMock.get(`${DEV_URL}/index.js`, "export default 1;");

    expect(await fetchDevServerBundle(DEV_URL)).toBe("export default 1;");
  });

  it("requests the bundle with no HTTP caching, and gives up rather than hanging", async () => {
    fetchMock.get(`${DEV_URL}/index.js`, "export default 1;");

    await fetchDevServerBundle(DEV_URL);

    const call = fetchMock.callHistory.lastCall(`${DEV_URL}/index.js`);
    expect(call?.options.cache).toBe("no-store");
    expect(call?.options.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws when the dev server does not serve the bundle", async () => {
    fetchMock.get(`${DEV_URL}/index.js`, 404);

    await expect(fetchDevServerBundle(DEV_URL)).rejects.toThrow(
      `Dev server responded 404 for ${DEV_URL}/index.js`,
    );
  });
});

describe("fetchDevServerManifest", () => {
  const manifest = { name: "my-viz", version: "1.0.0" };

  it("returns the parsed manifest from the dev server", async () => {
    fetchMock.get(`${DEV_URL}/metabase-plugin.json`, manifest);

    expect(await fetchDevServerManifest(DEV_URL)).toEqual(manifest);
  });

  it("throws when the dev server does not serve the manifest", async () => {
    fetchMock.get(`${DEV_URL}/metabase-plugin.json`, 500);

    await expect(fetchDevServerManifest(DEV_URL)).rejects.toThrow(
      `Dev server responded 500 for ${DEV_URL}/metabase-plugin.json`,
    );
  });
});

describe("dev server failure modes", () => {
  it.each(["localhost:5174", "//localhost:5174", "/localhost:5174"])(
    "refuses to fetch %p, which is not an absolute URL",
    async (url) => {
      await expect(fetchDevServerBundle(url).catch(errorKind)).resolves.toBe(
        "invalid-url",
      );
      expect(fetchMock.callHistory.calls()).toHaveLength(0);
    },
  );

  it("reports an unreachable dev server", async () => {
    fetchMock.get(`${DEV_URL}/metabase-plugin.json`, {
      throws: new TypeError("Failed to fetch"),
    });

    await expect(
      fetchDevServerManifest(DEV_URL).catch(errorKind),
    ).resolves.toBe("unreachable");
  });

  it("reports a manifest that is served but missing", async () => {
    fetchMock.get(`${DEV_URL}/metabase-plugin.json`, 404);

    await expect(
      fetchDevServerManifest(DEV_URL).catch(errorKind),
    ).resolves.toBe("not-ok");
  });

  it("reports a manifest URL that answers with HTML instead of JSON", async () => {
    fetchMock.get(`${DEV_URL}/metabase-plugin.json`, {
      status: 200,
      body: "<!doctype html><title>vite</title>",
      headers: { "content-type": "text/html" },
    });

    await expect(
      fetchDevServerManifest(DEV_URL).catch(errorKind),
    ).resolves.toBe("invalid-manifest");
  });
});
