import fetchMock from "fetch-mock";

import { loadLocaleCatalog } from "./load-locale-catalog-from-instance";

const CATALOG = {
  headers: { language: "fr", "plural-forms": "nplurals=2; plural=(n > 1);" },
  translations: { "": {} },
};

// The bundler replaces these at build time, so production sees constants. The
// branch between them is the thing worth pinning.
describe("loadLocaleCatalog (from the instance)", () => {
  const { VERSION, GIT_COMMIT_SHA } = process.env;

  afterEach(() => {
    process.env.VERSION = VERSION;
    process.env.GIT_COMMIT_SHA = GIT_COMMIT_SHA;
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  function lastUrl() {
    return fetchMock.callHistory.calls().at(-1)?.url ?? "";
  }

  it("names the release the bundle came from, so the catalogue can be cached", async () => {
    process.env.VERSION = "v0.56.1";
    fetchMock.get("path:/app/locales/fr.json", CATALOG);

    await loadLocaleCatalog("fr");

    expect(lastUrl()).toContain("/app/locales/fr.json?v=v0.56.1");
  });

  it("falls back to the commit outside a release build, where the tag is a sentinel", async () => {
    process.env.VERSION = "vUNKNOWN";
    process.env.GIT_COMMIT_SHA = "abc1234";
    fetchMock.get("path:/app/locales/fr.json", CATALOG);

    await loadLocaleCatalog("fr");

    expect(lastUrl()).toContain("/app/locales/fr.json?v=abc1234");
  });

  it("leaves the URL unversioned when neither is known, which the server declines to cache", async () => {
    delete process.env.VERSION;
    delete process.env.GIT_COMMIT_SHA;
    fetchMock.get("path:/app/locales/fr.json", CATALOG);

    await loadLocaleCatalog("fr");

    expect(lastUrl()).not.toContain("?v=");
  });
});
