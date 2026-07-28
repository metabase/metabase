import type { Location } from "metabase/router";

import { isEmptyParams, parseUrlParams } from "./utils";

function createLocation(query: Location["query"]): Location {
  return {
    pathname: "/monitor/content-diagnostics/stale",
    search: "",
    hash: "",
    state: undefined,
    action: "POP",
    key: "test",
    query,
  };
}

describe("parseUrlParams", () => {
  it("returns empty params when query string is empty", () => {
    expect(parseUrlParams(createLocation({}))).toEqual({
      page: undefined,
      query: undefined,
    });
  });

  it("parses page and query", () => {
    expect(
      parseUrlParams(createLocation({ page: "2", query: "sales" })),
    ).toEqual({
      page: 2,
      query: "sales",
    });
  });

  it("ignores non-numeric page values", () => {
    expect(
      parseUrlParams(createLocation({ page: "abc" })).page,
    ).toBeUndefined();
  });

  it("parses entity-types and include-personal-collections", () => {
    expect(
      parseUrlParams(
        createLocation({
          "entity-types": ["card", "transform"],
          "include-personal-collections": "false",
        }),
      ),
    ).toEqual({
      entityTypes: ["card", "transform"],
      includePersonalCollections: false,
    });
  });

  it("drops entity-types values that are not covered types", () => {
    expect(
      parseUrlParams(createLocation({ "entity-types": ["card", "bogus"] }))
        .entityTypes,
    ).toEqual(["card"]);
  });

  it("parses sort-column and sort-direction", () => {
    const params = parseUrlParams(
      createLocation({
        "sort-column": "last-active-at",
        "sort-direction": "desc",
      }),
    );
    expect(params.sortColumn).toBe("last-active-at");
    expect(params.sortDirection).toBe("desc");
  });

  it("drops sort values that are not allowed", () => {
    const params = parseUrlParams(
      createLocation({ "sort-column": "collection", "sort-direction": "up" }),
    );
    expect(params.sortColumn).toBeUndefined();
    expect(params.sortDirection).toBeUndefined();
  });
});

describe("isEmptyParams", () => {
  it("returns true for an empty query string", () => {
    expect(isEmptyParams(createLocation({}))).toBe(true);
  });

  it("treats default params as empty", () => {
    expect(
      isEmptyParams(
        createLocation({
          page: "0",
          "entity-types": ["card", "dashboard", "document", "transform"],
          "include-personal-collections": "true",
        }),
      ),
    ).toBe(true);
  });

  it("returns false for non-default params", () => {
    expect(isEmptyParams(createLocation({ page: "1" }))).toBe(false);
    expect(isEmptyParams(createLocation({ query: "sales" }))).toBe(false);
  });
});
