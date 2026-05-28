export function clearWorkspaceInstanceConfig() {
  cy.request("DELETE", "/api/ee/workspace-instance/table-remappings");
  return cy.request("PUT", "/api/setting/instance-workspace", { value: null });
}
