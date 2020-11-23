import React from "react";
import { Provider } from "react-redux";
import { getStore } from "metabase/store";

import { getMetadata } from "metabase/selectors/metadata";
import { chain } from "icepick";

import state from "./sample_dataset_fixture.json";
export { default as state } from "./sample_dataset_fixture.json";

export const SAMPLE_DATASET_ID = 1;
export const ANOTHER_DATABASE_ID = 2;
export const MONGO_DATABASE_ID = 3;
export const MULTI_SCHEMA_DATABASE_ID = 4;
export const OTHER_MULTI_SCHEMA_DATABASE_ID = 5;

export const MAIN_METRIC_ID = 1;

function aliasTablesAndFields(metadata) {
  // alias DATABASE.TABLE.FIELD for convienence in tests
  // NOTE: this assume names don't conflict with other properties in Database/Table which I think is safe for Sample Dataset
  for (const database of Object.values(metadata.databases)) {
    for (const table of database.tables) {
      if (!(table.name in database)) {
        database[table.name] = table;
      }
      for (const field of table.fields) {
        if (!(field.name in table)) {
          table[field.name] = field;
        }
      }
    }
  }
}

export function createMetadata(updateState = state => state) {
  const stateModified = updateState(chain(state)).value();
  const metadata = getMetadata(stateModified);
  aliasTablesAndFields(metadata);
  return metadata;
}

export const metadata = createMetadata();

export const SAMPLE_DATASET = metadata.database(SAMPLE_DATASET_ID);
export const ANOTHER_DATABASE = metadata.database(ANOTHER_DATABASE_ID);
export const MONGO_DATABASE = metadata.database(MONGO_DATABASE_ID);
export const MULTI_SCHEMA_DATABASE = metadata.database(
  MULTI_SCHEMA_DATABASE_ID,
);
export const OTHER_MULTI_SCHEMA_DATABASE = metadata.database(
  OTHER_MULTI_SCHEMA_DATABASE_ID,
);

export const ORDERS = SAMPLE_DATASET.ORDERS;
export const PRODUCTS = SAMPLE_DATASET.PRODUCTS;
export const PEOPLE = SAMPLE_DATASET.PEOPLE;
export const REVIEWS = SAMPLE_DATASET.REVIEWS;

export function makeMetadata(metadata) {
  metadata = {
    databases: {
      1: { name: "database", tables: [] },
    },
    schemas: {},
    tables: {
      1: { display_name: "table", fields: [], segments: [], metrics: [] },
    },
    fields: {
      1: { display_name: "field" },
    },
    metrics: {
      1: { name: "metric" },
    },
    segments: {
      1: { name: "segment" },
    },
    ...metadata,
  };
  // convienence for filling in missing bits
  for (const objects of Object.values(metadata)) {
    for (const [id, object] of Object.entries(objects)) {
      object.id = /^\d+$/.test(id) ? parseInt(id) : id;
      if (!object.name && object.display_name) {
        object.name = object.display_name;
      }
    }
  }
  // linking to default db
  for (const table of Object.values(metadata.tables)) {
    if (table.db == null) {
      const db0 = Object.values(metadata.databases)[0];
      table.db = db0.id;
      (db0.tables = db0.tables || []).push(table.id);
    }
  }
  // linking to default table
  for (const childType of ["fields", "segments", "metrics"]) {
    for (const child of Object.values(metadata[childType])) {
      if (child.table == null) {
        const table0 = Object.values(metadata.tables)[0];
        child.table = table0.id;
        (table0[childType] = table0[childType] || []).push(child.id);
      }
    }
  }
  return getMetadata({ entities: metadata });
}

const nopEntitiesReducer = (s = state.entities, a) => s;

// simple provider which only supports static metadata defined above, no actions will take effect
export const StaticEntitiesProvider = ({ children }) => (
  <Provider store={getStore({ entities: nopEntitiesReducer }, null, state)}>
    {children}
  </Provider>
);
