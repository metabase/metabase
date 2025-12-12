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

  // Force the color scheme to be consistent, otherwise, it will pick up system color theme
  window.localStorage.setItem("metabase-color-scheme", "light");

  return cy.request("POST", `/api/testing/restore/${name}`);
}
