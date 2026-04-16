import { resetWritableDb } from "./e2e-qa-databases-helpers";

export function snapshot(name) {
  cy.request("POST", `/api/testing/snapshot/${name}`);
}

/**
 * Take a snapshot during cross-version test development.
 *
 * This is a no-op in CI / production runs. It only takes effect when
 * the `CROSS_VERSION_DEV_MODE` env var is exposed through Cypress,
 * allowing developers to incrementally snapshot state while iterating
 * on cross-version test scenarios locally.
 *
 * @param {string} name - snapshot identifier
 */
export function snapshotCrossVersionDev(name) {
  if (!Cypress.expose?.("CROSS_VERSION_DEV_MODE")) {
    cy.log(
      `skipping cross-version snapshot "${name}" — not running in dev mode (production runs against Postgres)`,
    );
    return;
  }
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

  return cy.request("POST", `/api/testing/restore/${name}`);
}

/**
 * Restore a snapshot during cross-version test development.
 *
 * This is a no-op in CI / production runs. It only takes effect when
 * the `CROSS_VERSION_DEV_MODE` env var is exposed through Cypress,
 * allowing developers to restore a previously-saved snapshot while
 * iterating on cross-version test scenarios locally.
 *
 * @param {string} [name="blank"] - snapshot identifier to restore
 */
export function restoreCrossVersionDev(name = "blank") {
  if (!Cypress.expose?.("CROSS_VERSION_DEV_MODE")) {
    cy.log(
      `skipping cross-version restore "${name}" — not running in dev mode (production runs against Postgres)`,
    );
    return;
  }

  return cy.request("POST", `/api/testing/restore/${name}`);
}
