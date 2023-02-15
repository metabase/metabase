import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

export function enableActionsForDB(dbId = SAMPLE_DB_ID) {
  return cy.request("PUT", `/api/database/${dbId}`, {
    settings: {
      "database-enable-actions": true,
    },
  });
}
