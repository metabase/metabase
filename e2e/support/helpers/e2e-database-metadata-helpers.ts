import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
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
        fields[field.name.toUpperCase()] = getRawTableFieldId(field);
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
