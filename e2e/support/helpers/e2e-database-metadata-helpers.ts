import { H2_SAMPLE_DB_ID, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import type {
  Database,
  DatabaseId,
  FieldId,
  TableId,
} from "metabase-types/api";

type FieldsMap = Record<string, FieldId>;
type DatabaseMap = {
  [key: string]: FieldsMap;
} & {
  [K in string as `${K}_ID`]: TableId;
};

export function withDatabase(
  databaseId: DatabaseId,
  callback: (database: DatabaseMap) => void,
) {
  cy.request<Database>(
    "GET",
    `/api/database/${databaseId}/metadata?include_hidden=true`,
  ).then(({ body }) => {
    const database: DatabaseMap = {};

    for (const table of body.tables ?? []) {
      const fields: FieldsMap = {};

      for (const field of table.fields ?? []) {
        if (typeof field.id !== "number") {
          throw new Error(
            "Sanity check: raw db table field ids should always be numbers",
          );
        }

        fields[field.name.toUpperCase()] = field.id;
      }

      database[table.name.toUpperCase()] = fields;
      Object.assign(database, {
        [`${table.name.toUpperCase()}_ID`]: table.id,
      });
    }

    callback(database);
  });
}

export function withSampleDatabase(callback: (database: DatabaseMap) => void) {
  return withDatabase(SAMPLE_DB_ID, callback);
}

/**
 * Resolve table/field metadata for the H2-backed copy of the sample data (id 2 in the default
 * snapshot). Use in tests that are coupled to H2-specific sample-data behavior. Tests that don't
 * care about the engine should keep using {@link withSampleDatabase} (SQLite, the default).
 */
export function withH2SampleDatabase(
  callback: (database: DatabaseMap) => void,
) {
  return withDatabase(H2_SAMPLE_DB_ID, callback);
}
