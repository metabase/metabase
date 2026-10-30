const { H } = cy;

import type { Dashboard, DashboardId } from "metabase-types/api";

const SEARCH_TERM = "dismissal";
const FIRST_DASHBOARD_NAME = "E2E dismissal first dashboard";
const SECOND_DASHBOARD_NAME = "E2E dismissal second dashboard";

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
    H.runContentDiagnosticsScan();

    H.visitContentDiagnosticsTab("empty");
    H.searchFindings(SEARCH_TERM);

    cy.intercept("POST", "/api/ee/content-diagnostics/invalidate").as(
      "dismissFindings",
    );
    cy.intercept({
      method: "GET",
      pathname: "/api/ee/content-diagnostics/imbalanced",
      query: { query: SEARCH_TERM },
    }).as("refreshedFindings");

    H.findImbalancedContentFindingRow(FIRST_DASHBOARD_NAME)
      .findByRole("checkbox")
      .click();
    H.findImbalancedContentFindingRow(SECOND_DASHBOARD_NAME)
      .findByRole("checkbox")
      .click();

    cy.findByTestId("content-diagnostics-bulk-actions").within(() => {
      cy.findByText("2 items selected").should("be.visible");
      cy.findByRole("button", { name: "Dismiss findings" }).click();
    });
    H.modal().within(() => {
      cy.findByText("Dismiss 2 findings?").should("be.visible");
      cy.findByRole("button", { name: "Dismiss findings" }).click();
    });

    cy.wait("@dismissFindings").its("response.statusCode").should("eq", 200);
    H.undoToast().findByText("Dismissed 2 findings").should("be.visible");
    cy.wait("@refreshedFindings").its("response.body.total").should("eq", 0);
    H.main().findByText("No empty content found").should("be.visible");
    cy.findByTestId("content-diagnostics-bulk-actions").should("not.exist");

    cy.log("Both dashboards should still exist");
    cy.wrap(["@firstDashboardId", "@secondDashboardId"]).each(
      (alias: string) => {
        cy.get<DashboardId>(alias).then((id) => {
          cy.request<Dashboard>("GET", `/api/dashboard/${id}`)
            .its("body.archived")
            .should("eq", false);
        });
      },
    );
  });
});
