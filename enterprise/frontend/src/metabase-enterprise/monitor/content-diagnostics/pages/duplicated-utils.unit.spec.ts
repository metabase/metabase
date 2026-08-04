import type { Location } from "metabase/router";

import {
  isEmptyDuplicatedParams,
  parseDuplicatedUrlParams,
} from "./duplicated-utils";

function createLocation(query: Location["query"]): Location {
  return {
    pathname: "/monitor/content-diagnostics/duplicated",
    search: "",
    hash: "",
    state: undefined,
    action: "POP",
    key: "test",
    query,
  };
}

describe("parseDuplicatedUrlParams", () => {
  it("accepts collections as an entity type", () => {
    expect(
      parseDuplicatedUrlParams(
        createLocation({ "entity-types": ["collection", "model"] }),
      ).entityTypes,
    ).toEqual(["collection", "model"]);
  });

  it("drops entity-types values that are not covered types", () => {
    expect(
      parseDuplicatedUrlParams(
        createLocation({ "entity-types": ["model", "bogus"] }),
      ).entityTypes,
    ).toEqual(["model"]);
  });

  it("parses min-duplicate-count", () => {
    expect(
      parseDuplicatedUrlParams(createLocation({ "min-duplicate-count": "3" }))
        .minDuplicateCount,
    ).toBe(3);
  });

  it("parses sort-column and sort-direction", () => {
    const params = parseDuplicatedUrlParams(
      createLocation({
        "sort-column": "duplicate-count",
        "sort-direction": "desc",
      }),
    );
    expect(params.sortColumn).toBe("duplicate-count");
    expect(params.sortDirection).toBe("desc");
  });

  it("drops sort values that are not allowed", () => {
    const params = parseDuplicatedUrlParams(
      createLocation({ "sort-column": "duration-ms", "sort-direction": "up" }),
    );
    expect(params.sortColumn).toBeUndefined();
    expect(params.sortDirection).toBeUndefined();
  });
});

describe("isEmptyDuplicatedParams", () => {
  it("treats default params as empty", () => {
    expect(
      isEmptyDuplicatedParams(
        createLocation({
          page: "0",
          "entity-types": [
            "question",
            "model",
            "metric",
            "dashboard",
            "document",
            "transform",
            "collection",
          ],
          "include-personal-collections": "true",
        }),
      ),
    ).toBe(true);
  });

  it("returns false for non-default params", () => {
    expect(
      isEmptyDuplicatedParams(createLocation({ "min-duplicate-count": "2" })),
    ).toBe(false);
    expect(isEmptyDuplicatedParams(createLocation({ query: "sales" }))).toBe(
      false,
    );
  });
});
