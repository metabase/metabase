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
export function restore(name = "default", { reindex = false } = {}) {
  cy.log("Restore Data Set");

  // automatically reset the data db if this is a test that uses a writable db
  if (name.includes("-writable")) {
    const dbType = name.includes("postgres") ? "postgres" : "mysql";

    resetWritableDb({ type: dbType });
  }

  return cy.request({
    method: "POST",
    url: `/api/testing/restore/${name}`,
    ...(reindex && { qs: { reindex: true } }),
  });
}
