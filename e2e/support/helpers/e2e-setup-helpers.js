export function snapshot(name) {
  cy.request("POST", `/api/testing/snapshot/${name}`);
}

export function restore(name = "default") {
  // cy.skipOn(name.includes("mongo") && Cypress.env("QA_DB_MONGO") !== true);

  cy.log("Restore Data Set");
  cy.request("POST", `/api/testing/restore/${name}`);
}
