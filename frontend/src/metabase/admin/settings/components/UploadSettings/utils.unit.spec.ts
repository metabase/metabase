import { checkNotNull } from "metabase/core/utils/types";
import { Database } from "metabase-types/api";
import { createMockDatabase, createMockSchema } from "metabase-types/api/mocks";
import { createMockMetadata } from "__support__/metadata";
import { getDatabaseOptions, getSchemaOptions, dbHasSchema } from "./utils";

const setup = (databases: Database[]) => {
  const metadata = createMockMetadata({ databases });
  return databases.map(({ id }) => checkNotNull(metadata.database(id)));
};

describe("Admin > UploadSettings > utils", () => {
  const dbs = setup([
    createMockDatabase({
      id: 100,
      settings: { "database-enable-actions": true },
      engine: "postgres",
    }),
    createMockDatabase({
      id: 200,
      settings: { "database-enable-actions": false },
      engine: "h2",
    }),
    createMockDatabase({
      id: 300,
      settings: { "database-enable-actions": true },
      engine: "mysql",
    }),
  ]);

  const schema = [
    createMockSchema({ id: "a", name: "schema1" }),
    createMockSchema({ id: "b", name: "schema2" }),
    createMockSchema({ id: "c", name: "schema3" }),
  ];

  describe("getDatabaseOptions", () => {
    it("should return an array of actions-enabled databases", () => {
      expect(getDatabaseOptions(dbs)).toEqual([
        { name: "Database", value: 100 },
        { name: "Database", value: 300 },
      ]);
    });
    it("should return an empty array if no actions-enabled databases", () => {
      expect(getDatabaseOptions([])).toEqual([]);
    });
  });

  describe("getSchemaOptions", () => {
    it("should return an array of schema", () => {
      expect(getSchemaOptions(schema)).toEqual([
        { name: "schema1", value: "schema1" },
        { name: "schema2", value: "schema2" },
        { name: "schema3", value: "schema3" },
      ]);
    });
  });

  describe("dbHasSchema", () => {
    it("should return true if db has schema", () => {
      expect(dbHasSchema(dbs, 100)).toBe(true);
      expect(dbHasSchema(dbs, 200)).toBe(true);
    });

    it("should return false if db does not have schema", () => {
      expect(dbHasSchema(dbs, 300)).toBe(false);
    });

    it("should return false if db does not exist", () => {
      expect(dbHasSchema(dbs, 400)).toBe(false);
    });
  });
});
