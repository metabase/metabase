// Cleanup helper for tests that bring up workspace mode via the UI: kicks the
// instance out of workspace mode in a single API call so afterEach hooks stay
// fast.
export function clearWorkspaceInstanceConfig() {
  return cy.request("DELETE", "/api/ee/workspace-instance/current");
}
