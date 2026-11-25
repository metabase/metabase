const { H } = cy;

import type { Dashboard, DashboardId } from "metabase-types/api";

const FIRST_DASHBOARD_ALIAS = "firstDashboardId";
const SECOND_DASHBOARD_ALIAS = "secondDashboardId";

// The selection bar, its confirmation copy, permissions-based disabling and the
// list refresh are covered in ImbalancedContentPage.unit.spec.tsx. These tests
// check the real writes and that the backend drops the findings afterwards.
describe("scenarios > monitor > content diagnostics > bulk actions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("dismisses selected findings without trashing their content", () => {
    const searchTerm = "dismissal";
    const firstDashboardName = "E2E dismissal first dashboard";
    const secondDashboardName = "E2E dismissal second dashboard";
    createDashboards(firstDashboardName, secondDashboardName);
    H.runContentDiagnosticsScan();

    H.visitContentDiagnosticsTab("empty");
    H.searchFindings(searchTerm);
    interceptRefreshedFindings(searchTerm);
    cy.intercept("POST", "/api/ee/content-diagnostics/invalidate").as(
      "dismissFindings",
    );

    selectFindings(firstDashboardName, secondDashboardName);
    cy.findByTestId("content-diagnostics-bulk-actions")
      .findByRole("button", { name: "Dismiss findings" })
      .click();
    H.modal().findByRole("button", { name: "Dismiss findings" }).click();

    cy.wait("@dismissFindings").its("response.statusCode").should("eq", 200);
    cy.wait("@refreshedFindings").its("response.body.total").should("eq", 0);

    cy.log("Both dashboards should still exist");
    assertDashboardsArchived(false);

    cy.log("The dismissed findings should stay hidden after a reload");
    assertNoFindingsAfterReload(searchTerm);
  });

  it("moves the selected findings to the trash and drops them from the list", () => {
    const searchTerm = "trashing";
    const firstDashboardName = "E2E trashing first dashboard";
    const secondDashboardName = "E2E trashing second dashboard";
    createDashboards(firstDashboardName, secondDashboardName);
    H.runContentDiagnosticsScan();

    H.visitContentDiagnosticsTab("empty");
    H.searchFindings(searchTerm);
    interceptRefreshedFindings(searchTerm);
    cy.intercept("PUT", "/api/dashboard/*").as("trashDashboard");

    selectFindings(firstDashboardName, secondDashboardName);
    cy.findByTestId("content-diagnostics-bulk-actions")
      .findByRole("button", { name: "Move to trash" })
      .click();
    H.modal().findByRole("button", { name: "Move to trash" }).click();

    cy.wait(["@trashDashboard", "@trashDashboard"]).each(
      (interception: { response?: { statusCode: number } }) => {
        expect(interception.response?.statusCode).to.eq(200);
      },
    );
    cy.log(
      "trashing the entities invalidates their findings, so the list empties",
    );
    cy.wait("@refreshedFindings").its("response.body.total").should("eq", 0);

    cy.log("Both dashboards should be in the trash");
    assertDashboardsArchived(true);

    cy.log("The trashed findings should stay hidden after a reload");
    assertNoFindingsAfterReload(searchTerm);
  });
});

function createDashboards(firstName: string, secondName: string) {
  H.createDashboard(
    { name: firstName },
    { wrapId: true, idAlias: FIRST_DASHBOARD_ALIAS },
  );
  H.createDashboard(
    { name: secondName },
    { wrapId: true, idAlias: SECOND_DASHBOARD_ALIAS },
  );
}

function interceptRefreshedFindings(searchTerm: string) {
  cy.intercept({
    method: "GET",
    pathname: "/api/ee/content-diagnostics/imbalanced",
    query: { query: searchTerm },
  }).as("refreshedFindings");
}

function selectFindings(...names: string[]) {
  names.forEach((name) => {
    H.findImbalancedContentFindingRow(name).findByRole("checkbox").click();
  });
}

function assertDashboardsArchived(archived: boolean) {
  [FIRST_DASHBOARD_ALIAS, SECOND_DASHBOARD_ALIAS].forEach((alias) => {
    cy.get<DashboardId>(`@${alias}`).then((id) => {
      cy.request<Dashboard>("GET", `/api/dashboard/${id}`)
        .its("body.archived")
        .should("eq", archived);
    });
  });
}

function assertNoFindingsAfterReload(searchTerm: string) {
  H.visitContentDiagnosticsTab("empty");
  H.searchFindings(searchTerm);
  H.main().findByText("No empty content found").should("be.visible");
}
