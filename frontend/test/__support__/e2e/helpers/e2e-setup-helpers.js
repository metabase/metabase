const RESTORE_ATTEMPTS = 4;

export function snapshot(name) {
  cy.request("POST", `/api/testing/snapshot/${name}`);
}

export function restore(name = "default") {
  cy.log("Restore Data Set");
  // Restore sometimes throw a 500 error in e2e tests but it's idempotent so
  // we can retry a couple of times
  for (let i = 0; i < RESTORE_ATTEMPTS; i++) {
    try {
      cy.request("POST", `/api/testing/restore/${name}`);
      // If the restore doesn't throw, we can break out
      return;
    } catch {
      // If we fail, wait a second before trying again in case its a race condition
      cy.wait(1000);
    }
  }
  // One final request to throw an exception
  cy.request("POST", `/api/testing/restore/${name}`);
}
