import { createMockDatabase } from "metabase-types/api/mocks/database";

import Schema from "./Schema";
import Database from "./Database";
import Table from "./Table";

const database = createMockDatabase();
const databaseInstance = new Database(database);

const schema = {
  id: "1:foo",
  name: "foo",
  database: databaseInstance,
};

const schemaInstance = new Schema(schema);

describe("Schema", () => {
  describe("instantiation", () => {
    it("should create an instance of Schema", () => {
      expect(schemaInstance).toBeInstanceOf(Schema);
    });

    it("should add properties from the schema object to the instance", () => {
      for (const [key, value] of Object.entries(schema)) {
        expect(schemaInstance[key as keyof Schema]).toEqual(value);
      }
    });

    it("should add properties found on the constructor object that aren't in defined in ISchema", () => {
      const schemaInstance = new Schema({
        ...schema,
        // @ts-expect-error: we're testing that properties that aren't in ISchema are added to the instance
        abc: 123,
      });

      // @ts-expect-error: we're testing that properties that aren't in ISchema are added to the instance
      expect(schemaInstance.abc).toEqual(123);
    });
  });

  describe("displayName", () => {
    it("should return a formatted `name` string", () => {
      expect(schemaInstance.displayName()).toBe("Foo");
    });
  });

  describe("getTable", () => {
    it("should return an empty array by default or if there are no tables associated with the schema", () => {
      expect(schemaInstance.getTables()).toEqual([]);
    });

    it("should return a list of tables associated with the schema once the schema instance has been hydrated", () => {
      const tableInstance = new Table();
      const schemaInstance = new Schema(schema);
      schemaInstance.tables = [tableInstance];

      expect(schemaInstance.getTables()).toEqual([tableInstance]);
    });
  });
});
