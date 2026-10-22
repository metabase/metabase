import type { SearchContext } from "metabase-types/api";

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
    expect(toSnowplowContentTypes(["not-a-content-type"])).toEqual(["other"]);
  });

  it("de-duplicates, collapsing repeats and multiple untracked models to a single 'other'", () => {
    expect(
      toSnowplowContentTypes(["card", "card", "mystery-a", "mystery-b"]),
    ).toEqual(["card", "other"]);
  });
});

describe("toSnowplowContext", () => {
  it("passes a snowplow-enum context through unchanged", () => {
    expect(toSnowplowContext("search-app")).toBe("search-app");
    expect(toSnowplowContext("data-picker")).toBe("data-picker");
  });

  it("maps every SearchContext to itself — none is currently bucketed to 'other'", () => {
    // PENDING_CONTEXTS is empty today, so identity holds for all contexts; if a context is later
    // added to PENDING_CONTEXTS it will map to "other" and this assertion should move to expect that.
    // Record<SearchContext, true> forces this list to stay exhaustive: adding a
    // SearchContext member without extending it fails to compile.
    const allContexts: Record<SearchContext, true> = {
      "basic-actions": true,
      browse: true,
      "command-palette": true,
      "data-picker": true,
      dependencies: true,
      document: true,
      "embedding-setup": true,
      "entity-picker": true,
      library: true,
      "model-migration": true,
      "search-app": true,
      "search-bar": true,
      "type-filter": true,
    };
    // Unjustified type cast. FIXME
    for (const context of Object.keys(allContexts) as SearchContext[]) {
      expect(toSnowplowContext(context)).toBe(context);
    }
  });
});
