import Metadata from "metabase-lib/lib/metadata/Metadata";
import Database from "metabase-lib/lib/metadata/Database";

import {
  metadata, // connected graph,
  state, // the original non connected metadata objects,
  DATABASE_ID,
  ORDERS_TABLE_ID,
  ORDERS_CREATED_DATE_FIELD_ID,
} from "__support__/sample_dataset_fixture";

import { copyObjects } from "../../src/metabase/selectors/metadata";

const NUM_TABLES = Object.keys(state.entities.tables).length;
const NUM_DBS = Object.keys(state.entities.databases).length;
const NUM_FIELDS = Object.keys(state.entities.fields).length;
const NUM_METRICS = Object.keys(state.entities.metrics).length;
const NUM_SEGMENTS = Object.keys(state.entities.segments).length;

// NOTE: Also tests in redux/metadata.spec.js cover the use of metadata selectors
describe("getMetadata", () => {
  it("should properly transfer metadata", () => {
    expect(metadata).toBeInstanceOf(Metadata);

    expect(Object.keys(metadata.databases).length).toEqual(NUM_DBS);
    expect(Object.keys(metadata.tables).length).toEqual(NUM_TABLES);
    expect(Object.keys(metadata.fields).length).toEqual(NUM_FIELDS);
    expect(Object.keys(metadata.metrics).length).toEqual(NUM_METRICS);
    expect(Object.keys(metadata.segments).length).toEqual(NUM_SEGMENTS);
  });

  describe("connected database", () => {
    it("should have the proper number of tables", () => {
      const database = metadata.databases[DATABASE_ID];
      expect(database.tables.length).toEqual(NUM_TABLES);
    });
  });

  describe("connected table", () => {
    const table = metadata.tables[ORDERS_TABLE_ID];

    it("should have the proper number of fields", () => {
      // TODO - make this more dynamic
      expect(table.fields.length).toEqual(7);
    });

    it("should have a parent database", () => {
      expect(table.database).toEqual(metadata.databases[DATABASE_ID]);
    });
  });

  describe("connected field", () => {
    const field = metadata.fields[ORDERS_CREATED_DATE_FIELD_ID];
    it("should have a parent table", () => {
      expect(field.table).toEqual(metadata.tables[ORDERS_TABLE_ID]);
    });
  });
});

describe("copyObjects", () => {
  it("should clone each object in the provided mapping of objects", () => {
    const meta = new Metadata();
    const databases = state.entities.databases;
    const copiedDatabases = copyObjects(meta, databases, Database);

    expect(Object.keys(copiedDatabases).length).toEqual(NUM_DBS);

    Object.values(copiedDatabases).map(db => {
      expect(db).toBeInstanceOf(Database);
      expect(db).toHaveProperty("metadata");
      expect(db.metadata).toBeInstanceOf(Metadata);
    });
  });
});
