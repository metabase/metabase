import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  getShallowDatabaseSchemas,
  getShallowDatabaseTables,
  getShallowDatabases,
  getShallowFieldById,
  getShallowFieldName,
  getShallowSchemaTables,
  getShallowSchemas,
  getShallowTableFields,
  getShallowTables,
} from "./selectors";

const MULTI_SCHEMA_DB_ID = 2;
const HIDDEN_TABLE_ID = 100;
const PARENT_FIELD_ID = 1000;
const CHILD_FIELD_ID = 1001;

const entities = createMockEntitiesState({
  databases: [
    createSampleDatabase(),
    createMockDatabase({
      id: MULTI_SCHEMA_DB_ID,
      tables: [
        createMockTable({
          id: 101,
          db_id: MULTI_SCHEMA_DB_ID,
          schema: "first",
          fields: [
            createMockField({
              id: PARENT_FIELD_ID,
              table_id: 101,
              display_name: "Parent",
            }),
            createMockField({
              id: CHILD_FIELD_ID,
              table_id: 101,
              parent_id: PARENT_FIELD_ID,
              display_name: "Child",
            }),
          ],
        }),
        createMockTable({
          id: 102,
          db_id: MULTI_SCHEMA_DB_ID,
          schema: "second",
        }),
        createMockTable({
          id: HIDDEN_TABLE_ID,
          db_id: MULTI_SCHEMA_DB_ID,
          schema: "second",
          visibility_type: "hidden",
        }),
      ],
    }),
  ],
});

const ids = (records: { id: unknown }[] | undefined) =>
  records?.map((record) => record.id);

function setup() {
  const state = createMockState({ entities });

  return {
    state,
    databases: getShallowDatabases(state),
    schemas: getShallowSchemas(state),
    tables: getShallowTables(state),
    databaseSchemas: getShallowDatabaseSchemas(state),
    databaseTables: getShallowDatabaseTables(state),
    schemaTables: getShallowSchemaTables(state),
    tableFields: getShallowTableFields(state),
    fieldById: getShallowFieldById(state),
    fieldName: getShallowFieldName(state),
  };
}

describe("store relation selectors", () => {
  it("should resolve each relation from normalized records", () => {
    const { databaseSchemas, databaseTables, schemaTables, tableFields } =
      setup();
    const [firstSchema, secondSchema] = databaseSchemas(MULTI_SCHEMA_DB_ID);

    expect(firstSchema.name).toBe("first");
    expect(secondSchema.name).toBe("second");
    expect(ids(databaseTables(MULTI_SCHEMA_DB_ID))).toEqual([101, 102]);
    expect(ids(schemaTables(secondSchema.id))).toEqual([102]);
    expect(ids(tableFields(ORDERS_ID))).toEqual(
      entities.tables[ORDERS_ID].fields,
    );
    expect(tableFields(ORDERS_ID).length).toBeGreaterThan(0);
  });

  it("should leave out hidden tables", () => {
    const { tables, databaseTables } = setup();

    expect(tables[HIDDEN_TABLE_ID]).toBeUndefined();
    expect(ids(databaseTables(MULTI_SCHEMA_DB_ID))).not.toContain(
      HIDDEN_TABLE_ID,
    );
  });

  it("should hand out the store's normalized records", () => {
    const { databases, schemas, tables, databaseSchemas, fieldById } = setup();
    const [schema] = databaseSchemas(SAMPLE_DB_ID);

    expect(databases[SAMPLE_DB_ID]).toBe(entities.databases[SAMPLE_DB_ID]);
    expect(schemas[schema.id]).toBe(schema);
    expect(tables[ORDERS_ID]).toBe(entities.tables[ORDERS_ID]);
    expect(fieldById(ORDERS.TOTAL)).toBe(entities.fields[ORDERS.TOTAL]);
  });

  it("should name a nested field after its parents", () => {
    const { fieldById, fieldName } = setup();
    const child = fieldById(CHILD_FIELD_ID);

    expect(child && fieldName(child)).toBe("Parent: Child");
  });

  it("should fall back to a field's own display name when it did not hand the field out", () => {
    const { fieldName } = setup();

    expect(
      fieldName(
        createMockField({ id: 9999, table_id: 999, display_name: "Own name" }),
      ),
    ).toBe("Own name");
  });

  it("should return the same lookup until the store's slices change", () => {
    const { state, databaseSchemas } = setup();

    expect(getShallowDatabaseSchemas({ ...state })).toBe(databaseSchemas);
  });
});
