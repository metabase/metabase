import type { WorkspaceInstance } from "metabase-types/api";

export function setWorkspaceInstanceConfig(config: WorkspaceInstance) {
  return cy.request("POST", "/api/ee/workspace-instance/current", config);
}

export function clearWorkspaceInstanceConfig() {
  return cy.request("DELETE", "/api/ee/workspace-instance/current");
}
