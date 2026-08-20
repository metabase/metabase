import fetchMock from "fetch-mock";

import {
  fetchDevServerBundle,
  fetchDevServerManifest,
  getDevServerSseUrl,
  getDevServerUrl,
} from "./dev-server";

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

  // The CLI's dev server resolves requests straight onto the filesystem using the raw `req.url`, so a
  // cache-busting `?t=…` makes it look for a file with the query in its name and 404. Freshness comes from
  // `cache: "no-store"` instead. A query string here breaks hot reload against any already-published SDK.
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

  it("requests the bundle with no HTTP caching", async () => {
    fetchMock.get(`${DEV_URL}/index.js`, "export default 1;");

    await fetchDevServerBundle(DEV_URL);

    const call = fetchMock.callHistory.lastCall(`${DEV_URL}/index.js`);
    expect(call?.options.cache).toBe("no-store");
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
