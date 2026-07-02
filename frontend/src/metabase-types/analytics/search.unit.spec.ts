import type { SearchContext, SearchModel } from "metabase-types/api";

import { toSnowplowContentTypes, toSnowplowContext } from "./search";

describe("toSnowplowContentTypes", () => {
  it("returns null when models is null or undefined", () => {
    expect(toSnowplowContentTypes(null)).toBeNull();
    expect(toSnowplowContentTypes(undefined)).toBeNull();
  });

  it("returns an empty array for no models (distinct from a null/absent filter)", () => {
    expect(toSnowplowContentTypes([])).toEqual([]);
  });

  it("passes tracked models through unchanged", () => {
    expect(toSnowplowContentTypes(["card", "dashboard", "dataset"])).toEqual([
      "card",
      "dashboard",
      "dataset",
    ]);
  });

  it("buckets untracked models into 'other'", () => {
    // A model that is a valid SearchModel but not in the snowplow content_type enum.
    expect(
      toSnowplowContentTypes(["not-a-content-type" as SearchModel]),
    ).toEqual(["other"]);
  });

  it("de-duplicates, collapsing repeats and multiple untracked models to a single 'other'", () => {
    expect(
      toSnowplowContentTypes([
        "card",
        "card",
        "mystery-a" as SearchModel,
        "mystery-b" as SearchModel,
      ]),
    ).toEqual(["card", "other"]);
  });
});

describe("toSnowplowContext", () => {
  it("passes a snowplow-enum context through unchanged", () => {
    expect(toSnowplowContext("search-app")).toBe("search-app");
    expect(toSnowplowContext("data-picker")).toBe("data-picker");
  });

  it("returns a non-null context for every SearchContext", () => {
    const contexts: SearchContext[] = [
      "basic-actions",
      "browse",
      "command-palette",
      "data-picker",
      "dependencies",
      "document",
      "embedding-setup",
      "entity-picker",
      "library",
      "model-migration",
      "search-app",
      "search-bar",
      "type-filter",
    ];
    for (const context of contexts) {
      expect(toSnowplowContext(context)).toBe(context);
    }
  });
});
