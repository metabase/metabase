import { isEmptyStaleParams, parseStaleUrlParams } from "./utils";

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

describe("parseStaleUrlParams", () => {
  it("returns empty params when query string is empty", () => {
    expect(parseStaleUrlParams(createSearchParams({}))).toEqual({
      page: undefined,
      query: undefined,
    });
  });

  it("parses page and query", () => {
    expect(
      parseStaleUrlParams(createSearchParams({ page: "2", query: "sales" })),
    ).toEqual({
      page: 2,
      query: "sales",
    });
  });

  it("ignores non-numeric page values", () => {
    expect(
      parseStaleUrlParams(createSearchParams({ page: "abc" })).page,
    ).toBeUndefined();
  });

  it("parses entity-types and include-personal-collections", () => {
    expect(
      parseStaleUrlParams(
        createSearchParams({
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
        createSearchParams({ "entity-types": ["model", "bogus"] }),
      ).entityTypes,
    ).toEqual(["model"]);
  });

  it("parses sort-column and sort-direction", () => {
    const params = parseStaleUrlParams(
      createSearchParams({
        "sort-column": "last-active-at",
        "sort-direction": "desc",
      }),
    );
    expect(params.sortColumn).toBe("last-active-at");
    expect(params.sortDirection).toBe("desc");
  });

  it("drops sort values that are not allowed", () => {
    const params = parseStaleUrlParams(
      createSearchParams({
        "sort-column": "collection",
        "sort-direction": "up",
      }),
    );
    expect(params.sortColumn).toBeUndefined();
    expect(params.sortDirection).toBeUndefined();
  });
});

describe("isEmptyStaleParams", () => {
  it("returns true for an empty query string", () => {
    expect(isEmptyStaleParams(createSearchParams({}))).toBe(true);
  });

  it("treats default params as empty", () => {
    expect(
      isEmptyStaleParams(
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
    ).toBe(true);
  });

  it("returns false for non-default params", () => {
    expect(isEmptyStaleParams(createSearchParams({ page: "1" }))).toBe(false);
    expect(isEmptyStaleParams(createSearchParams({ query: "sales" }))).toBe(
      false,
    );
  });
});
