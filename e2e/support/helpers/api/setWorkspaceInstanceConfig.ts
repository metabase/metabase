export function clearWorkspaceInstanceConfig() {
  return cy.request("DELETE", "/api/ee/workspace-instance/current");
}
