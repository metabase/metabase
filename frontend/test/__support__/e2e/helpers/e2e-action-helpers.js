import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

export function enableActionsForDB(dbId = SAMPLE_DB_ID) {
  return cy.request("PUT", `/api/database/${dbId}`, {
    settings: {
      "database-enable-actions": true,
    },
  });
}

export function fillActionQuery(query) {
  cy.get(".ace_content").type(query, { parseSpecialCharSequences: false });

/**
 *
 * @param {import("metabase/entities/actions/actions").CreateQueryActionParams} actionDetails
 */
export function createAction(actionDetails) {
  return cy.request("POST", "/api/action", actionDetails);
}
