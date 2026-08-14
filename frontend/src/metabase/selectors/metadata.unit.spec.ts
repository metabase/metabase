import { normalize } from "normalizr";

import { getMainStore } from "__support__/entities-store";
import { createMockEntitiesState } from "__support__/store";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { DatabaseSchema } from "metabase/schema";
import { getMetadata } from "metabase/selectors/metadata";
import { clone } from "metabase/utils/clone";
import { checkNotNull } from "metabase/utils/types";
import Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSegment,
  createMockSettings,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

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

  // The identity of the metadata object is the cache key for the metabase-lib
  // metadata provider, so a refetch that changes nothing must not replace it.
  describe("identity across refetches", () => {
    const hydrate = (store: ReturnType<typeof getMainStore>, db: Database) =>
      store.dispatch({
        type: "metabase/entities/UPDATE",
        payload: normalize(db, DatabaseSchema),
      });

    it("keeps the same metadata object when a refetch returns identical data", () => {
      const store = getMainStore();
      const database = createSampleDatabase();

      hydrate(store, database);
      const first = getMetadata(store.getState());

      hydrate(store, clone(database));
      const second = getMetadata(store.getState());

      expect(second).toBe(first);
    });

    it("builds a new metadata object when a refetch returns changed data", () => {
      const store = getMainStore();
      const database = createSampleDatabase();

      hydrate(store, database);
      const first = getMetadata(store.getState());

      const renamed = clone(database);
      const orders = checkNotNull(
        renamed.tables?.find((table) => table.id === ORDERS_ID),
      );
      orders.display_name = "Renamed";
      hydrate(store, renamed);
      const second = getMetadata(store.getState());

      expect(second).not.toBe(first);
      expect(checkNotNull(second.table(ORDERS_ID)).display_name).toBe(
        "Renamed",
      );
    });
  });
});
