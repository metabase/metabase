import { getPathnameBeforeSlug, getSlug } from "./use-sync-url-slug";

describe("getSlug", () => {
  it("should return a lower-cased, hyphenated concatenation of the tabId and name", () => {
    expect(getSlug({ tabId: 1, name: "SoMe-TaB-NaMe" })).toEqual(
      "1-some-tab-name",
    );
  });

  it("should return an empty string when tabId or name is invalid", () => {
    expect(getSlug({ tabId: null, name: "SoMe-TaB-NaMe" })).toEqual("");
    expect(getSlug({ tabId: -1, name: "SoMe-TaB-NaMe" })).toEqual("");

    expect(getSlug({ tabId: 1, name: "" })).toEqual("");
    expect(getSlug({ tabId: 1, name: undefined })).toEqual("");
  });
});

describe("getPathnameBeforeSlug", () => {
  it("should return the portion of the pathname that precedes the tab id slug", () => {
    expect(getPathnameBeforeSlug("/dashboard/1-name")).toEqual(
      "/dashboard/1-name",
    );
    expect(getPathnameBeforeSlug("/dashboard/1-name/")).toEqual(
      "/dashboard/1-name",
    );
    expect(getPathnameBeforeSlug("/dashboard/1-name/2-tab-name")).toEqual(
      "/dashboard/1-name",
    );
    expect(
      getPathnameBeforeSlug("public/dashboard/someverylonguuid/3-tab-name"),
    ).toEqual("public/dashboard/someverylonguuid");
  });
});
