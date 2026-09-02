import {
  isEmptyDuplicatedParams,
  parseDuplicatedUrlParams,
} from "./duplicated-utils";

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

describe("parseDuplicatedUrlParams", () => {
  it("accepts collections as an entity type", () => {
    expect(
      parseDuplicatedUrlParams(
        createSearchParams({ "entity-types": ["collection", "model"] }),
      ).entityTypes,
    ).toEqual(["collection", "model"]);
  });

  it("drops entity-types values that are not covered types", () => {
    expect(
      parseDuplicatedUrlParams(
        createSearchParams({ "entity-types": ["model", "bogus"] }),
      ).entityTypes,
    ).toEqual(["model"]);
  });

  it("parses min-duplicate-count", () => {
    expect(
      parseDuplicatedUrlParams(
        createSearchParams({ "min-duplicate-count": "3" }),
      ).minDuplicateCount,
    ).toBe(3);
  });

  it("parses sort-column and sort-direction", () => {
    const params = parseDuplicatedUrlParams(
      createSearchParams({
        "sort-column": "duplicate-count",
        "sort-direction": "desc",
      }),
    );
    expect(params.sortColumn).toBe("duplicate-count");
    expect(params.sortDirection).toBe("desc");
  });

  it("drops sort values that are not allowed", () => {
    const params = parseDuplicatedUrlParams(
      createSearchParams({
        "sort-column": "duration-ms",
        "sort-direction": "up",
      }),
    );
    expect(params.sortColumn).toBeUndefined();
    expect(params.sortDirection).toBeUndefined();
  });
});

describe("isEmptyDuplicatedParams", () => {
  it("returns true when the URL carries no recognized params", () => {
    expect(isEmptyDuplicatedParams(createSearchParams({}))).toBe(true);
    expect(
      isEmptyDuplicatedParams(createSearchParams({ unrelated: "1" })),
    ).toBe(true);
  });

  it("returns false when the URL explicitly asks for default values", () => {
    expect(
      isEmptyDuplicatedParams(
        createSearchParams({
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
    ).toBe(false);
  });

  it("returns false for non-default params", () => {
    expect(
      isEmptyDuplicatedParams(
        createSearchParams({ "min-duplicate-count": "2" }),
      ),
    ).toBe(false);
    expect(
      isEmptyDuplicatedParams(createSearchParams({ query: "sales" })),
    ).toBe(false);
  });
});
