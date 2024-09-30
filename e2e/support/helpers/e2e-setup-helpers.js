export function snapshot(name) {
  cy.request("POST", `/api/testing/snapshot/${name}`);
}

/**
 *
 * @param { |
 * "blank" |
 * "setup" |
 * "without-models" |
 * "default" |
 * "withSqlite" |
 * "mongo-5" |
 * "postgres-12" |
 * "postgres-writable" |
 * "mysql-8" |
 * "mysql-writable"
 * } name
 */
export function restore(name = "default") {
  cy.skipOn(name.includes("mongo") && Cypress.env("QA_DB_MONGO") !== true);

  cy.log("Restore Data Set");
  cy.request("POST", `/api/testing/restore/${name}`);
}
