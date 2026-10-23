import { resetWritableDb } from "./e2e-qa-databases-helpers";

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
 * "mongo-5" |
 * "postgres-12" |
 * "postgres-writable" |
 * "mysql-8" |
 * "mysql-writable"
 * } name
 */
export function restore(name = "default") {
  cy.log("Restore Data Set");

  // automatically reset the data db if this is a test that uses a writable db
  if (name.includes("-writable")) {
    const dbType = name.includes("postgres") ? "postgres" : "mysql";

    resetWritableDb({ type: dbType });
  }

  cy.request({
    method: "POST",
    url: "/api/testing/reset-throttlers",
    failOnStatusCode: false,
  });

  return cy.request({
    method: "POST",
    url: `/api/testing/restore/${name}`,
    // the restore endpoint takes an app DB write lock, drops and reloads
    // everything, then re-syncs search; under CI load it can exceed the
    // default 30s responseTimeout (EMB-2363)
    timeout: 60_000,
  });
}
