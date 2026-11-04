export type ContentDiagnosticsTab =
  | "stale"
  | "slow"
  | "duplicated"
  | "empty"
  | "sparse"
  | "crowded";

const FINDINGS_ALIAS = "findings";

// Empty, sparse and crowded are views over the same endpoint.
const TAB_ENDPOINTS: Record<ContentDiagnosticsTab, string> = {
  stale: "/api/ee/content-diagnostics/stale",
  slow: "/api/ee/content-diagnostics/slow",
  duplicated: "/api/ee/content-diagnostics/duplicated",
  empty: "/api/ee/content-diagnostics/imbalanced",
  sparse: "/api/ee/content-diagnostics/imbalanced",
  crowded: "/api/ee/content-diagnostics/imbalanced",
};

export function runContentDiagnosticsScan() {
  return cy.request("POST", "/api/testing/content-diagnostics/scan");
}

export function visitContentDiagnosticsTab(tab: ContentDiagnosticsTab) {
  cy.intercept("GET", `${TAB_ENDPOINTS[tab]}*`).as(FINDINGS_ALIAS);
  cy.visit(`/monitor/content-diagnostics/${tab}`);
  cy.wait(`@${FINDINGS_ALIAS}`);
}

export function findImbalancedContentFindingRow(name: string) {
  return cy
    .findByTestId("imbalanced-content-list")
    .contains('[role="row"]', name);
}

export function searchFindings(term: string) {
  cy.H.main().findByLabelText("Search").type(term);
  cy.wait(`@${FINDINGS_ALIAS}`);
}
