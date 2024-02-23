import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import type { Database, Schema } from "metabase-types/api";
import { createMockDatabase, createMockSchema } from "metabase-types/api/mocks";

import { getDatabaseOptions, getSchemaOptions, dbHasSchema } from "./utils";

interface SetupOpts {
  databases: Database[];
  schemas: Schema[];
}

const setup = ({ databases, schemas }: SetupOpts) => {
  const metadata = createMockMetadata({ databases, schemas });

  return {
    databases: databases.map(({ id }) => checkNotNull(metadata.database(id))),
    schemas: schemas.map(({ id }) => checkNotNull(metadata.schema(id))),
  };
};

describe("Admin > UploadSettings > utils", () => {
  const { databases, schemas } = setup({
    databases: [
      createMockDatabase({
        id: 100,
        engine: "postgres",
        features: ["schemas"],
      }),
      createMockDatabase({
        id: 200,
        engine: "h2",
        features: ["schemas"],
      }),
      createMockDatabase({
        id: 300,
        engine: "mysql",
      }),
    ],
    schemas: [
      createMockSchema({ id: "a", name: "schema1" }),
      createMockSchema({ id: "b", name: "schema2" }),
      createMockSchema({ id: "c", name: "schema3" }),
    ],
  });

  describe("getDatabaseOptions", () => {
    it("should return an array of databases", () => {
      expect(getDatabaseOptions(databases)).toEqual([
        { name: "Database", value: 100 },
        { name: "Database", value: 200 },
        { name: "Database", value: 300 },
      ]);
    });
    it("should return an empty array if there are no databases", () => {
      expect(getDatabaseOptions([])).toEqual([]);
    });
  });

  describe("getSchemaOptions", () => {
    it("should return an array of schema", () => {
      expect(getSchemaOptions(schemas)).toEqual([
        { name: "schema1", value: "schema1" },
        { name: "schema2", value: "schema2" },
        { name: "schema3", value: "schema3" },
      ]);
    });
  });

  describe("dbHasSchema", () => {
    it("should return true if db has schema", () => {
      expect(dbHasSchema(databases, 100)).toBe(true);
      expect(dbHasSchema(databases, 200)).toBe(true);
    });

    it("should return false if db does not have schema", () => {
      expect(dbHasSchema(databases, 300)).toBe(false);
    });

    it("should return false if db does not exist", () => {
      expect(dbHasSchema(databases, 400)).toBe(false);
    });
  });
});
