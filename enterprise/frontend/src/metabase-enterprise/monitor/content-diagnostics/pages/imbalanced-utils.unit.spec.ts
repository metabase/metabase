import {
  isEmptyImbalancedParams,
  parseImbalancedUrlParams,
} from "./imbalanced-utils";

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

describe("parseImbalancedUrlParams", () => {
  it("accepts collections as an entity type", () => {
    expect(
      parseImbalancedUrlParams(
        createSearchParams({ "entity-types": ["collection", "dashboard"] }),
      ).entityTypes,
    ).toEqual(["collection", "dashboard"]);
  });

  it("drops entity-types values that are not covered types", () => {
    expect(
      parseImbalancedUrlParams(
        createSearchParams({ "entity-types": ["model", "bogus"] }),
      ).entityTypes,
    ).toEqual(["model"]);
  });

  it("parses sort-column and sort-direction", () => {
    const params = parseImbalancedUrlParams(
      createSearchParams({
        "sort-column": "content-count",
        "sort-direction": "desc",
      }),
    );
    expect(params.sortColumn).toBe("content-count");
    expect(params.sortDirection).toBe("desc");
  });

  it("drops sort values that are not allowed", () => {
    const params = parseImbalancedUrlParams(
      createSearchParams({
        "sort-column": "duplicate-count",
        "sort-direction": "up",
      }),
    );
    expect(params.sortColumn).toBeUndefined();
    expect(params.sortDirection).toBeUndefined();
  });
});

describe("isEmptyImbalancedParams", () => {
  it("returns true when the URL carries no recognized params", () => {
    expect(isEmptyImbalancedParams(createSearchParams({}))).toBe(true);
    expect(
      isEmptyImbalancedParams(createSearchParams({ unrelated: "1" })),
    ).toBe(true);
  });

  it("returns false for non-default params", () => {
    expect(
      isEmptyImbalancedParams(createSearchParams({ query: "sales" })),
    ).toBe(false);
    expect(
      isEmptyImbalancedParams(
        createSearchParams({ "sort-column": "content-count" }),
      ),
    ).toBe(false);
  });
});
