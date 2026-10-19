import {
  parsePage,
  parseQuery,
  parseSortColumn,
  parseSortDirection,
} from "./utils";

describe("parsePage", () => {
  it("reads a page number", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(["2", "5"])).toBe(2);
  });

  it("falls back to the first page for a missing, negative or non-numeric value", () => {
    expect(parsePage(undefined)).toBe(0);
    expect(parsePage("-1")).toBe(0);
    expect(parsePage("abc")).toBe(0);
  });
});

describe("parseQuery", () => {
  it("trims the search", () => {
    expect(parseQuery("  claude  ")).toBe("claude");
    expect(parseQuery(["  ann ", "bob"])).toBe("ann");
  });

  it("reads a missing search as searching for nothing", () => {
    expect(parseQuery(undefined)).toBe("");
    expect(parseQuery(null)).toBe("");
  });
});

describe("parseSortColumn", () => {
  const columns = ["name", "created_at"] as const;

  it("uses the default column when the value is missing or invalid", () => {
    expect(parseSortColumn(undefined, columns, "name")).toBe("name");
    expect(parseSortColumn("invalid", columns, "name")).toBe("name");
  });

  it("returns undefined when the default column is omitted", () => {
    expect(parseSortColumn(undefined, columns)).toBeUndefined();
    expect(parseSortColumn("invalid", columns)).toBeUndefined();
    expect(parseSortColumn("created_at", columns)).toBe("created_at");
  });
});

describe("parseSortDirection", () => {
  it("uses the default direction when the value is missing or invalid", () => {
    expect(parseSortDirection(undefined, "asc")).toBe("asc");
    expect(parseSortDirection("invalid", "asc")).toBe("asc");
  });

  it("returns undefined when the default direction is omitted", () => {
    expect(parseSortDirection(undefined)).toBeUndefined();
    expect(parseSortDirection("invalid")).toBeUndefined();
    expect(parseSortDirection("desc")).toBe("desc");
  });
});
