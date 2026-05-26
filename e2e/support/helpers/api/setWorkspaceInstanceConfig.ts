import type { WorkspaceInstance } from "metabase-types/api";

export function setWorkspaceInstanceConfig(config: WorkspaceInstance) {
  return cy.request("POST", "/api/testing/workspace-instance", config);
}

export function clearWorkspaceInstanceConfig() {
  return cy.request("DELETE", "/api/testing/workspace-instance");
}
