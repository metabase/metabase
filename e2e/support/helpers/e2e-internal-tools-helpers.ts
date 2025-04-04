export function setTableEditingEnabledForDB(dbId: number, enabled = true) {
  return cy.request("PUT", `/api/database/${dbId}`, {
    settings: {
      "database-enable-table-editing": enabled,
    },
  });
}
