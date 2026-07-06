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
  });

  it("falls back to the id when the name starts with a digit", () => {
    expect(permalinkDatabase({ id: 7, name: "7-sales" })).toBe(
      "/browse/databases/7",
    );
    expect(permalinkDatabase({ id: 9, name: "2024_metrics" })).toBe(
      "/browse/databases/9",
    );
  });
});
