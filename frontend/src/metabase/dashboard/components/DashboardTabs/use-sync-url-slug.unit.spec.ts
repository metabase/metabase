import type { Location } from "history";

import { createMockLocation } from "__support__/location";

import { parseSlug, getSlug } from "./use-sync-url-slug";

function getMockLocation(slug: Location["query"][string]) {
  return createMockLocation({ query: { tab: slug } });
}

describe("parseSlug", () => {
  it("should return the slug from the location object if valid", () => {
    const slug = "1-tab-name";
    expect(parseSlug({ location: getMockLocation(slug) })).toBe(slug);
  });

  it("should return undefined if the slug is invalid", () => {
    expect(parseSlug({ location: getMockLocation(null) })).toBe(undefined);
    expect(parseSlug({ location: getMockLocation(undefined) })).toBe(undefined);
    expect(parseSlug({ location: getMockLocation("") })).toBe(undefined);
    expect(
      parseSlug({
        location: getMockLocation(["1-tab-name", "2-another-tab-name"]),
      }),
    ).toBe(undefined);
    expect(parseSlug({ location: { ...getMockLocation(""), query: {} } })).toBe(
      undefined,
    );
  });
});

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
