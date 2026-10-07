const { H } = cy;

import type { Dashboard } from "metabase-types/api";

import {
  runContentDiagnosticsScan,
  searchFindings,
  visitContentDiagnosticsTab,
} from "./helpers/content-diagnostics-helpers";

const SEARCH_TERM = "dismissal";
const FIRST_DASHBOARD_NAME = "E2E dismissal first dashboard";
const SECOND_DASHBOARD_NAME = "E2E dismissal second dashboard";

function findingRow(name: string) {
  return cy
    .findByTestId("imbalanced-content-list")
    .contains('[role="row"]', name);
}

describe("scenarios > monitor > content diagnostics > bulk dismissal", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("dismisses selected findings without trashing their content", () => {
    H.createDashboard(
      { name: FIRST_DASHBOARD_NAME },
      { wrapId: true, idAlias: "firstDashboardId" },
    );
    H.createDashboard(
      { name: SECOND_DASHBOARD_NAME },
      { wrapId: true, idAlias: "secondDashboardId" },
    );
    runContentDiagnosticsScan();

    visitContentDiagnosticsTab("empty");
    searchFindings(SEARCH_TERM);

    cy.intercept("POST", "/api/ee/content-diagnostics/invalidate").as(
      "dismissFindings",
    );
    cy.intercept({
      method: "GET",
      pathname: "/api/ee/content-diagnostics/imbalanced",
      query: { query: SEARCH_TERM },
    }).as("refreshedFindings");

    findingRow(FIRST_DASHBOARD_NAME).findByRole("checkbox").click();
    findingRow(SECOND_DASHBOARD_NAME).findByRole("checkbox").click();

    cy.findByTestId("content-diagnostics-bulk-actions").within(() => {
      cy.findByText("2 items selected").should("be.visible");
      cy.findByRole("button", { name: "Dismiss" }).click();
    });
    H.modal().within(() => {
      cy.findByText("Dismiss 2 findings?").should("be.visible");
      cy.findByRole("button", { name: "Dismiss" }).click();
    });

    cy.wait("@dismissFindings").its("response.statusCode").should("eq", 200);
    H.undoToast().findByText("Dismissed 2 findings").should("be.visible");
    cy.wait("@refreshedFindings").its("response.body.total").should("eq", 0);
    H.main().findByText("No empty content found").should("be.visible");
    cy.findByTestId("content-diagnostics-bulk-actions").should(
      "not.be.visible",
    );

    cy.log("Both dashboards should still exist");
    cy.wrap(["@firstDashboardId", "@secondDashboardId"]).each(
      (alias: string) => {
        cy.get<Dashboard["id"]>(alias).then((id) => {
          cy.request<Dashboard>("GET", `/api/dashboard/${id}`)
            .its("body.archived")
            .should("eq", false);
        });
      },
    );
  });
});
