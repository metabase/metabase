import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

export function withDatabase(databaseId, f) {
  cy.request(
    "GET",
    `/api/database/${databaseId}/metadata?include_hidden=true`,
  ).then(({ body }) => {
    const database = {};
    for (const table of body.tables) {
      const fields = {};
      for (const field of table.fields) {
        fields[field.name.toUpperCase()] = field.id;
      }
      database[table.name.toUpperCase()] = fields;
      database[table.name.toUpperCase() + "_ID"] = table.id;
    }
    f(database);
  });
}

export function withSampleDatabase(f) {
  return withDatabase(SAMPLE_DB_ID, f);
}
