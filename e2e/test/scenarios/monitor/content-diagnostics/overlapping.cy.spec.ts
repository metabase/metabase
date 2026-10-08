const { H } = cy;

import {
  runContentDiagnosticsScan,
  searchFindings,
  setThreshold,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const SEARCH_TERM = "overlapping";
const DASHBOARD_NAME = "E2E overlapping dashboard";

const DASHBOARD_TAB_LIMIT = 1;

const TABS = [
  { id: 1, name: "First tab" },
  { id: 2, name: "Second tab" },
];

describe("scenarios > monitor > content diagnostics > overlapping findings", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  // The checkers run independently, so one entity can cross two unrelated bounds at once.
  it("reports a dashboard that is crowded and empty at the same time", () => {
    setThreshold(
      "content-diagnostics-crowded-dashboard-threshold-tabs",
      DASHBOARD_TAB_LIMIT,
    );
    H.createDashboardWithTabs({ name: DASHBOARD_NAME, tabs: TABS });
    runContentDiagnosticsScan();

    cy.log("its tab count puts it over the crowded bound");
    visitContentDiagnosticsTab("crowded");
    searchFindings(SEARCH_TERM);

    cy.findByTestId("imbalanced-content-list")
      .findByText(DASHBOARD_NAME)
      .click();
    cy.findByTestId("content-diagnostics-sidebar")
      .findByText("2 tabs")
      .should("be.visible");

    cy.log("and holding no cards at all makes it empty on the same scan");
    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.findByTestId("imbalanced-content-list")
      .findByText(DASHBOARD_NAME)
      .click();
    cy.findByTestId("content-diagnostics-sidebar")
      .findByText("0 dashcards")
      .should("be.visible");
  });
});
