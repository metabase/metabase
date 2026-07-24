import type { Location } from "metabase/router";

import { parseUrlParams } from "./utils";

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
});
