import { ORDERS, PRODUCTS, PEOPLE } from "__support__/sample_database_fixture";
import Table from "./Table";

describe("Table", () => {
  const ordersTable = new Table(ORDERS);
  const productsTable = new Table(PRODUCTS);
  const peopleTable = new Table(PEOPLE);

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
            origin: { table: PRODUCTS },
          },
        ],
      });

      expect(table.connectedTables()).toEqual([productsTable]);
    });

    it("should return a list of table instances connected to it via FK fields", () => {
      expect(ordersTable.connectedTables()).toEqual([
        productsTable,
        peopleTable,
      ]);
    });
  });
});
