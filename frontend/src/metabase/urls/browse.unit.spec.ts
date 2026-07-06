import { permalinkDatabase } from "./browse";

describe("permalinkDatabase", () => {
  it("builds a raw-name URL", () => {
    expect(permalinkDatabase({ id: 1, name: "sales_db" })).toBe(
      "/browse/databases/sales_db",
    );
  });

  it("URL-encodes spaces and other special characters", () => {
    expect(permalinkDatabase({ id: 1, name: "Data Warehouse" })).toBe(
      "/browse/databases/Data%20Warehouse",
    );
  });

  it("encodes non-ASCII names raw instead of slugifying them", () => {
    const name = "Über Aufträge";
    expect(permalinkDatabase({ id: 1, name })).toBe(
      `/browse/databases/${encodeURIComponent(name)}`,
    );
    // a slugified link ("uber-auftrage") would not resolve back to the row
    expect(permalinkDatabase({ id: 1, name })).not.toContain("uber-auftrage");
  });

  it("falls back to the id when the name starts with a digit", () => {
    // the router parses leading digits as an id, so name resolution can't reach these;
    // emitting the id keeps the copied link resolvable
    expect(permalinkDatabase({ id: 7, name: "7-sales" })).toBe(
      "/browse/databases/7",
    );
    expect(permalinkDatabase({ id: 9, name: "2024_metrics" })).toBe(
      "/browse/databases/9",
    );
  });
});
