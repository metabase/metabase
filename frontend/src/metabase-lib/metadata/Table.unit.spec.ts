// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";
import Table from "./Table";

describe("Table", () => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  const productsTable = metadata.table(PRODUCTS_ID) as Table;

  describe("numFields", () => {
    it("should return the number of fields", () => {
      expect(productsTable.numFields()).toBe(8);
    });

    it("should handle scenario where fields prop is missing", () => {
      const table = new Table({});
      expect(table.numFields()).toBe(0);
    });
  });

  describe("connectedTables", () => {
    it("should return a list of table instances connected to it via fk", () => {
      const table = new Table({
        fks: [
          {
            origin: { table: productsTable },
          },
        ],
      });

      expect(table.connectedTables()).toEqual([productsTable]);
    });
  });

  describe("isVirtualCard", () => {
    it("should return false when the Table is not a virtual card table", () => {
      expect(productsTable.isVirtualCard()).toBe(false);
    });

    it("should return true when the Table is a virtual card table", () => {
      const virtualCardTable = new Table({
        id: "card__123",
      });
      expect(virtualCardTable.isVirtualCard()).toBe(true);
    });
  });
});
