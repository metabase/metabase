import type { Location } from "metabase/router";

import { isEmptyStaleParams, parseStaleUrlParams } from "./utils";

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

describe("parseStaleUrlParams", () => {
  it("returns empty params when query string is empty", () => {
    expect(parseStaleUrlParams(createLocation({}))).toEqual({
      page: undefined,
      query: undefined,
    });
  });

  it("parses page and query", () => {
    expect(
      parseStaleUrlParams(createLocation({ page: "2", query: "sales" })),
    ).toEqual({
      page: 2,
      query: "sales",
    });
  });

  it("ignores non-numeric page values", () => {
    expect(
      parseStaleUrlParams(createLocation({ page: "abc" })).page,
    ).toBeUndefined();
  });

  it("parses entity-types and include-personal-collections", () => {
    expect(
      parseStaleUrlParams(
        createLocation({
          "entity-types": ["model", "transform"],
          "include-personal-collections": "false",
        }),
      ),
    ).toEqual({
      entityTypes: ["model", "transform"],
      includePersonalCollections: false,
    });
  });

  it("drops entity-types values that are not covered types", () => {
    expect(
      parseStaleUrlParams(
        createLocation({ "entity-types": ["model", "bogus"] }),
      ).entityTypes,
    ).toEqual(["model"]);
  });

  it("parses sort-column and sort-direction", () => {
    const params = parseStaleUrlParams(
      createLocation({
        "sort-column": "last-active-at",
        "sort-direction": "desc",
      }),
    );
    expect(params.sortColumn).toBe("last-active-at");
    expect(params.sortDirection).toBe("desc");
  });

  it("drops sort values that are not allowed", () => {
    const params = parseStaleUrlParams(
      createLocation({ "sort-column": "collection", "sort-direction": "up" }),
    );
    expect(params.sortColumn).toBeUndefined();
    expect(params.sortDirection).toBeUndefined();
  });
});

describe("isEmptyStaleParams", () => {
  it("returns true for an empty query string", () => {
    expect(isEmptyStaleParams(createLocation({}))).toBe(true);
  });

  it("treats default params as empty", () => {
    expect(
      isEmptyStaleParams(
        createLocation({
          page: "0",
          "entity-types": [
            "question",
            "model",
            "metric",
            "dashboard",
            "document",
            "transform",
          ],
          "include-personal-collections": "true",
        }),
      ),
    ).toBe(true);
  });

  it("returns false for non-default params", () => {
    expect(isEmptyStaleParams(createLocation({ page: "1" }))).toBe(false);
    expect(isEmptyStaleParams(createLocation({ query: "sales" }))).toBe(false);
  });
});
