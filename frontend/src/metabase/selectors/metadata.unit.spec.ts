import { createMockEntitiesState } from "__support__/store";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import Metadata from "metabase-lib/v1/metadata/Metadata";
import {
  createMockDatabase,
  createMockMetric,
  createMockSegment,
  createMockSettings,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

function setup() {
  const sampleDatabase = createSampleDatabase();

  const databases = [
    sampleDatabase,
    createMockDatabase({ id: 2, name: "DB 2" }),
  ];

  const metrics = [
    createMockMetric({ id: 1, name: "Metric 1" }),
    createMockMetric({ id: 2, name: "Metric 2" }),
    createMockMetric({ id: 3, name: "Metric 3" }),
  ];

  const segments = [
    createMockSegment({ id: 1, name: "Segment 1" }),
    createMockSegment({ id: 2, name: "Segment 2" }),
  ];

  const settings = createMockSettings();

  const state = createMockState({
    entities: createMockEntitiesState({
      databases,
      metrics,
      segments,
    }),
    settings: createMockSettingsState(settings),
  });

  const metadata = getMetadata(state);

  return { metadata, sampleDatabase, metrics, segments, settings };
}

describe("getMetadata", () => {
  it("should properly transfer metadata", () => {
    const { metadata, sampleDatabase, metrics, segments, settings } = setup();
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
    expect(Object.keys(metadata.metrics).length).toEqual(metrics.length);
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
