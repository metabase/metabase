export function snapshot(name) {
  cy.request("POST", `/api/testing/snapshot/${name}`);
}

export function restore(name = "default") {
  cy.log("Restore Data Set");
  cy.request({
    method: "POST",
    url: `/api/testing/restore/${name}`,
  });
}
