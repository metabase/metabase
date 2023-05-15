import { normalize } from "normalizr";
import { chain } from "icepick";

import { getMetadata } from "metabase/selectors/metadata";
import { FieldSchema } from "metabase/schema";

import type { Field as IField, FieldId } from "metabase-types/api";
import type { EntitiesState, State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import type Database from "metabase-lib/metadata/Database";
import type Field from "metabase-lib/metadata/Field";
import type Metadata from "metabase-lib/metadata/Metadata";
import type Table from "metabase-lib/metadata/Table";

import stateFixture from "./sample_database_fixture.json";

export const state = stateFixture as unknown as State;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default state;

export const SAMPLE_DATABASE_ID = 1;
export const ANOTHER_DATABASE_ID = 2;
export const MONGO_DATABASE_ID = 3;
export const MULTI_SCHEMA_DATABASE_ID = 4;
export const OTHER_MULTI_SCHEMA_DATABASE_ID = 5;

export const MAIN_METRIC_ID = 1;

function aliasTablesAndFields(metadata: Metadata) {
  // alias DATABASE.TABLE.FIELD for convenience in tests
  // NOTE: this assume names don't conflict with other properties in Database/Table which I think is safe for Sample Database
  /* eslint-disable @typescript-eslint/ban-ts-comment */
  for (const database of Object.values(metadata.databases)) {
    for (const table of database.getTables()) {
      if (!(table.name in database)) {
        // @ts-ignore
        database[table.name] = table;
      }
      for (const field of table.fields) {
        if (!(field.name in table)) {
          // @ts-ignore
          table[field.name] = field;
        }
      }
    }
  }
  /* eslint-enable @typescript-eslint/ban-ts-comment */
}

function normalizeFields(fields: Record<string, IField>) {
  return normalize(fields, [FieldSchema]).entities.fields || {};
}

// Icepick doesn't expose it's IcepickWrapper type,
// so this trick pulls it out of the return type of chain()
// `icepickChainWrapper` is needed because typeof chain<State> doesn't work
// See: https://stackoverflow.com/questions/50321419/typescript-returntype-of-generic-function
const icepickChainWrapper = (state: State) => chain(state);
type EnhancedState = ReturnType<typeof icepickChainWrapper>;

export function createMetadata(updateState = (state: EnhancedState) => state) {
  // This allows to use icepick helpers inside custom `updateState` functions
  // Example: const metadata = createMetadata(state => state.assocIn(...))
  const stateModified = updateState(chain(state)).thaw().value();

  stateModified.entities.fields = normalizeFields(
    (stateModified.entities.fields as any) || {},
  );

  const metadata = getMetadata(stateModified);
  aliasTablesAndFields(metadata);
  return metadata;
}

export const metadata = createMetadata();

/* eslint-disable @typescript-eslint/no-non-null-assertion */

/**
 * In the wild, fields might not have a concrete ID
 * (e.g. when coming from a native query)
 * But for our sample data we can be sure that they're always concrete.
 */
type SimpleField = Omit<Field, "id"> & {
  id: FieldId;
};

type AliasedTable = Table & {
  [fieldName: string]: SimpleField;
};

/**
 * Databases below are extended with table aliases.
 * So it's possible to do SAMPLE_DATABASE.ORDERS or SAMPLE_DATABASE.ORDERS.TOTAL
 * to retrieve tables and field instances.
 */
type AliasedSampleDatabase = Database & {
  ORDERS: AliasedTable;
  PRODUCTS: AliasedTable;
  PEOPLE: AliasedTable;
  REVIEWS: AliasedTable;
};

export const SAMPLE_DATABASE = metadata.database(
  SAMPLE_DATABASE_ID,
) as AliasedSampleDatabase;

export const ANOTHER_DATABASE = metadata.database(ANOTHER_DATABASE_ID)!;
export const MONGO_DATABASE = metadata.database(MONGO_DATABASE_ID)!;
export const MULTI_SCHEMA_DATABASE = metadata.database(
  MULTI_SCHEMA_DATABASE_ID,
)!;
export const OTHER_MULTI_SCHEMA_DATABASE = metadata.database(
  OTHER_MULTI_SCHEMA_DATABASE_ID,
)!;
/* eslint-enable @typescript-eslint/no-non-null-assertion */

export const ORDERS = SAMPLE_DATABASE.ORDERS;
export const PRODUCTS = SAMPLE_DATABASE.PRODUCTS;
export const PEOPLE = SAMPLE_DATABASE.PEOPLE;
export const REVIEWS = SAMPLE_DATABASE.REVIEWS;

export function makeMetadata(
  metadata: Record<string, Record<string, any>>,
): Metadata {
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
      2: { name: "metric" },
    },
    segments: {
      1: { name: "segment" },
    },
    questions: {},
    ...metadata,
  };

  // convenience for filling in missing bits
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

  metadata.fields = normalizeFields(metadata.fields);

  return getMetadata(
    createMockState({ entities: metadata as unknown as EntitiesState }),
  );
}
