import { createMockSettingsState, createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import type { EntitiesState } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import Metadata from "metabase-lib/v1/metadata/Metadata";
import {
  createMockDatabase,
  createMockField,
  createMockForeignKey,
  createMockSegment,
  createMockSettings,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  getMetadata,
  getShallowTableFieldIds,
  getShallowTableForeignKeys,
} from "./selectors";

function setup() {
  const sampleDatabase = createSampleDatabase();

  const databases = [
    sampleDatabase,
    createMockDatabase({ id: 2, name: "DB 2" }),
  ];

  const segments = [
    createMockSegment({ id: 1, name: "Segment 1" }),
    createMockSegment({ id: 2, name: "Segment 2" }),
  ];

  const settings = createMockSettings();

  const state = createMockState({
    entities: createMockEntitiesState({
      databases,
      segments,
    }),
    settings: createMockSettingsState(settings),
  });

  const metadata = getMetadata(state);

  return { metadata, sampleDatabase, segments, settings };
}

describe("getMetadata", () => {
  it("should properly transfer metadata", () => {
    const { metadata, sampleDatabase, segments, settings } = setup();
    const sampleDatabaseTables = checkNotNull(sampleDatabase.tables);

    expect(metadata).toBeInstanceOf(Metadata);
    expect(Object.keys(metadata.databases).length).toEqual(2);
    expect(Object.keys(metadata.tables).length).toEqual(
      sampleDatabase?.tables?.length,
    );
    expect(Object.keys(metadata.fields).length).toEqual(
      sampleDatabaseTables.reduce(
        (count, table) => count + checkNotNull(table.fields).length,
        0,
      ),
    );
    expect(Object.keys(metadata.segments).length).toEqual(segments.length);
    expect(metadata.settings).toEqual(settings);
    expect(metadata.setting("site-url")).toEqual(settings["site-url"]);
  });

  describe("connected table", () => {
    it("should have a parent database", () => {
      const { metadata } = setup();
      const table = checkNotNull(metadata.table(ORDERS_ID));
      expect(table.database).toEqual(metadata.database(SAMPLE_DB_ID));
    });
  });

  describe("connected field", () => {
    it("should have a parent table", () => {
      const { metadata } = setup();
      const field = checkNotNull(metadata.field(ORDERS.CREATED_AT));
      expect(field.table).toEqual(metadata.table(ORDERS_ID));
    });
  });
});

describe("table relations", () => {
  const TABLE_ID = 1;
  const CONNECTED_TABLE_ID = 2;
  const HIDDEN_TABLE_ID = 3;

  const entities = createMockEntitiesState({
    tables: [
      createMockTable({
        id: TABLE_ID,
        fields: [
          createMockField({ id: 10, table_id: TABLE_ID }),
          createMockField({
            id: 11,
            table_id: TABLE_ID,
            visibility_type: "sensitive",
          }),
        ],
        fks: [
          createMockForeignKey({
            origin_id: 20,
            origin: createMockField({ id: 20, table_id: CONNECTED_TABLE_ID }),
          }),
          createMockForeignKey({
            origin_id: 30,
            origin: createMockField({ id: 30, table_id: HIDDEN_TABLE_ID }),
          }),
        ],
      }),
      createMockTable({ id: CONNECTED_TABLE_ID, fks: undefined }),
      createMockTable({ id: HIDDEN_TABLE_ID, visibility_type: "hidden" }),
    ],
  });

  // A field updated on its own drops the table's `original_fields`, which
  // leaves only the table's field ids to resolve.
  const entitiesWithoutOriginalFields: EntitiesState = {
    ...entities,
    tables: {
      ...entities.tables,
      [TABLE_ID]: { ...entities.tables[TABLE_ID], original_fields: undefined },
    },
  };

  const v1FieldIds = (state: ReturnType<typeof createMockState>) =>
    getMetadata(state)
      .table(TABLE_ID)
      ?.fields?.map((field) => field.id);

  describe("getShallowTableFieldIds", () => {
    it("should list every original field, sensitive ones included, like getMetadata", () => {
      const state = createMockState({ entities });

      expect(getShallowTableFieldIds(state, TABLE_ID)).toEqual([10, 11]);
      expect(getShallowTableFieldIds(state, TABLE_ID)).toEqual(
        v1FieldIds(state),
      );
    });

    it("should list only visible fields without original fields, like getMetadata", () => {
      const state = createMockState({
        entities: entitiesWithoutOriginalFields,
      });

      expect(getShallowTableFieldIds(state, TABLE_ID)).toEqual([10]);
      expect(getShallowTableFieldIds(state, TABLE_ID)).toEqual(
        v1FieldIds(state),
      );
    });

    it("should list nothing for a hidden table, which getMetadata leaves out", () => {
      const state = createMockState({ entities });

      expect(getShallowTableFieldIds(state, HIDDEN_TABLE_ID)).toEqual([]);
      expect(getMetadata(state).table(HIDDEN_TABLE_ID)).toBeNull();
    });

    it("should return the same array until the table or its fields change", () => {
      const state = createMockState({ entities });
      const nextState = createMockState({ entities });

      expect(getShallowTableFieldIds(nextState, TABLE_ID)).toBe(
        getShallowTableFieldIds(state, TABLE_ID),
      );
    });
  });

  describe("getShallowTableForeignKeys", () => {
    it("should keep only foreign keys from visible tables, like getMetadata", () => {
      const state = createMockState({ entities });
      const v1OriginIds = getMetadata(state)
        .table(TABLE_ID)
        ?.fks?.filter((foreignKey) => foreignKey.origin != null)
        .map((foreignKey) => foreignKey.origin_id);

      const foreignKeys = getShallowTableForeignKeys(state, TABLE_ID);

      expect(foreignKeys?.map((foreignKey) => foreignKey.origin_id)).toEqual([
        20,
      ]);
      expect(foreignKeys?.map((foreignKey) => foreignKey.origin_id)).toEqual(
        v1OriginIds,
      );
      expect(foreignKeys?.[0].origin).toMatchObject({
        id: 20,
        table_id: CONNECTED_TABLE_ID,
      });
    });

    it("should be undefined before the table's foreign keys load", () => {
      const state = createMockState({ entities });

      expect(
        getShallowTableForeignKeys(state, CONNECTED_TABLE_ID),
      ).toBeUndefined();
      expect(getMetadata(state).table(CONNECTED_TABLE_ID)?.fks).toBeUndefined();
    });
  });
});
