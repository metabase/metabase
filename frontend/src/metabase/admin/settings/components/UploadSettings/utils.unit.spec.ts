import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import type { Database, Schema } from "metabase-types/api";
import { createMockDatabase, createMockSchema } from "metabase-types/api/mocks";

import { dbHasSchema, getDatabaseOptions, getSchemaOptions } from "./utils";

interface SetupOpts {
  databases: Database[];
  schemas: Schema[];
}

const setup = ({ databases, schemas }: SetupOpts) => {
  const metadata = createMockMetadata({ databases, schemas });

  return {
    databases: databases.map(({ id }) =>
      checkNotNull(metadata.database(id)),
    ) as Database[],
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
        { label: "Database", value: "100", disabled: false },
        { label: "Database", value: "200", disabled: false },
        { label: "Database", value: "300", disabled: false },
      ]);
    });

    it("should return an empty array if there are no databases", () => {
      expect(getDatabaseOptions([])).toEqual([]);
    });
  });

  it("should disable any options for dbs with db routing enabled", () => {
    expect(
      getDatabaseOptions([
        ...databases,
        createMockDatabase({
          id: 700,
          name: "Routed",
          engine: "postgres",
          router_user_attribute: "wut",
        }),
      ]),
    ).toEqual([
      { label: "Database", value: "100", disabled: false },
      { label: "Database", value: "200", disabled: false },
      { label: "Database", value: "300", disabled: false },
      { label: "Routed (DB Routing Enabled)", value: "700", disabled: true },
    ]);
  });

  it("should return an empty array if there are no databases", () => {
    expect(getDatabaseOptions([])).toEqual([]);
  });

  describe("getSchemaOptions", () => {
    it("should return an array of schema", () => {
      expect(getSchemaOptions(schemas.map((schema) => schema.name))).toEqual([
        { label: "schema1", value: "schema1" },
        { label: "schema2", value: "schema2" },
        { label: "schema3", value: "schema3" },
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
