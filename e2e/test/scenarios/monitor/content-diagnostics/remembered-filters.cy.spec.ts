const { H } = cy;

import { visitContentDiagnosticsTab } from "./helpers/content-diagnostics-helpers";

const STALE_INDEX_PATH = "/monitor/content-diagnostics/stale";

function openFilterPicker() {
  cy.findByTestId("content-diagnostics-filter-button").click();
}

function closeFilterPicker() {
  cy.get("body").type("{esc}");
}

function dropDashboardsFromTheFilter() {
  openFilterPicker();
  H.popover().findByLabelText("Dashboards").click();
  cy.wait("@findings");
  closeFilterPicker();
}

describe("scenarios > monitor > content diagnostics > remembered filters", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("brings back the filters last used on the tab", () => {
    visitContentDiagnosticsTab("stale");
    dropDashboardsFromTheFilter();
    cy.location("search").should("contain", "entity-types");

    cy.log("leave the tab and come back to it with a bare url");
    visitContentDiagnosticsTab("slow");
    visitContentDiagnosticsTab("stale");

    cy.log("the url is rewritten with what was last used here");
    cy.location("search").should("contain", "entity-types");

    openFilterPicker();
    H.popover().findByLabelText("Dashboards").should("not.be.checked");
    H.popover().findByLabelText("Questions").should("be.checked");
  });

  it("gives way to filters that came in on the url", () => {
    visitContentDiagnosticsTab("stale");
    dropDashboardsFromTheFilter();

    cy.log("the url asks for the opposite of what was remembered");
    cy.intercept("GET", "/api/ee/content-diagnostics/stale*").as("findings");
    cy.visit(`${STALE_INDEX_PATH}?entity-types=dashboard`);
    cy.wait("@findings");

    cy.location("search").should("contain", "entity-types=dashboard");

    openFilterPicker();
    H.popover().findByLabelText("Dashboards").should("be.checked");
    H.popover().findByLabelText("Questions").should("not.be.checked");
  });
});
