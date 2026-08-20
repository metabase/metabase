import { getDevServerSseUrl, getDevServerUrl } from "./dev-server";

describe("dev server URLs", () => {
  it("joins paths onto the configured origin", () => {
    expect(getDevServerUrl("http://localhost:5174", "index.js")).toBe(
      "http://localhost:5174/index.js",
    );
    expect(getDevServerSseUrl("http://localhost:5174")).toBe(
      "http://localhost:5174/__sse",
    );
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
    ["bundle", getDevServerUrl("http://localhost:5174", "index.js")],
    [
      "manifest",
      getDevServerUrl("http://localhost:5174", "metabase-plugin.json"),
    ],
    ["sse", getDevServerSseUrl("http://localhost:5174")],
  ])("builds the %s URL with no query string", (_name, url) => {
    expect(url).not.toContain("?");
  });
});
