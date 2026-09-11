import { isEmptySlowParams, parseSlowUrlParams } from "./slow-utils";

function createSearchParams(
  query: Record<string, string | string[]>,
): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    values.forEach((item) => searchParams.append(key, item));
  }
  return searchParams;
}

describe("parseSlowUrlParams", () => {
  it("returns empty params when query string is empty", () => {
    expect(parseSlowUrlParams(createSearchParams({}))).toEqual({});
  });

  it("parses page and query", () => {
    const params = parseSlowUrlParams(
      createSearchParams({ page: "2", query: "sales" }),
    );
    expect(params.page).toBe(2);
    expect(params.query).toBe("sales");
  });

  it("ignores non-numeric page values", () => {
    expect(
      parseSlowUrlParams(createSearchParams({ page: "abc" })).page,
    ).toBeUndefined();
  });

  it("parses entity-types and include-personal-collections", () => {
    const params = parseSlowUrlParams(
      createSearchParams({
        "entity-types": ["model", "transform"],
        "include-personal-collections": "false",
      }),
    );
    expect(params.entityTypes).toEqual(["model", "transform"]);
    expect(params.includePersonalCollections).toBe(false);
  });

  it("drops collections, which are not a slow entity type", () => {
    expect(
      parseSlowUrlParams(
        createSearchParams({ "entity-types": ["collection", "model"] }),
      ).entityTypes,
    ).toEqual(["model"]);
  });

  it("drops entity-types values that are not covered types", () => {
    expect(
      parseSlowUrlParams(
        createSearchParams({ "entity-types": ["model", "bogus"] }),
      ).entityTypes,
    ).toEqual(["model"]);
  });

  it("parses min-duration-ms", () => {
    expect(
      parseSlowUrlParams(createSearchParams({ "min-duration-ms": "30000" }))
        .minDurationMs,
    ).toBe(30000);
  });

  it("ignores a non-numeric min-duration-ms", () => {
    expect(
      parseSlowUrlParams(createSearchParams({ "min-duration-ms": "slow" }))
        .minDurationMs,
    ).toBeUndefined();
  });

  it("parses sort-column and sort-direction", () => {
    const params = parseSlowUrlParams(
      createSearchParams({
        "sort-column": "duration-ms",
        "sort-direction": "desc",
      }),
    );
    expect(params.sortColumn).toBe("duration-ms");
    expect(params.sortDirection).toBe("desc");
  });

  it("drops sort values that are not allowed", () => {
    const params = parseSlowUrlParams(
      createSearchParams({
        "sort-column": "duplicate-count",
        "sort-direction": "up",
      }),
    );
    expect(params.sortColumn).toBeUndefined();
    expect(params.sortDirection).toBeUndefined();
  });
});

describe("isEmptySlowParams", () => {
  it("returns true when the URL carries no recognized params", () => {
    expect(isEmptySlowParams(createSearchParams({}))).toBe(true);
    expect(isEmptySlowParams(createSearchParams({ unrelated: "1" }))).toBe(
      true,
    );
  });

  it("returns false when the URL explicitly asks for default values", () => {
    expect(
      isEmptySlowParams(
        createSearchParams({
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
    ).toBe(false);
  });

  it("returns false for non-default params", () => {
    expect(
      isEmptySlowParams(createSearchParams({ "min-duration-ms": "30000" })),
    ).toBe(false);
    expect(isEmptySlowParams(createSearchParams({ query: "sales" }))).toBe(
      false,
    );
  });
});
