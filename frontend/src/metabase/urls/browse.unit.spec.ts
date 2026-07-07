import { browseSchemaBySlug, permalinkDatabase } from "./browse";

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
    expect(permalinkDatabase({ id: 1, name: "Über Aufträge" })).toBe(
      "/browse/databases/%C3%9Cber%20Auftr%C3%A4ge",
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

describe("browseSchemaBySlug", () => {
  it("preserves an id-based database slug", () => {
    expect(browseSchemaBySlug("1-sample-database", "PUBLIC")).toBe(
      "/browse/databases/1-sample-database/schema/PUBLIC",
    );
  });

  it("preserves a name-based database slug and encodes both segments", () => {
    expect(browseSchemaBySlug("Data Warehouse", "über schema")).toBe(
      "/browse/databases/Data%20Warehouse/schema/%C3%BCber%20schema",
    );
  });
});
