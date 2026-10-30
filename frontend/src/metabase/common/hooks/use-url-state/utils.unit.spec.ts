import { parseSortColumn, parseSortDirection } from "./utils";

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
