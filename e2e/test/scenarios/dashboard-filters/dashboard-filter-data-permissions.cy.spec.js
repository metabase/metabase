const { H } = cy;
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

function filterDashboard() {
  H.visitDashboard(ORDERS_DASHBOARD_ID);
  H.filterWidget().click();

  cy.findByPlaceholderText("Search the list").type("Main Street");
  cy.contains("100 Main Street").click();

  H.dashboardParametersPopover().button("Add filter").click();
  H.filterWidget().should("contain", "100 Main Street");
  cy.location("search").should((search) =>
    expect(new URLSearchParams(search).get("text")).to.eq("100 Main Street"),
  );
}

describe("support > permissions (metabase#8472)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    // Setup a dashboard with a text filter
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();

    H.getDashboardCard(0)
      .realHover()
      .findByLabelText("Add a filter")
      .should("be.visible");

    H.setFilter("Text or Category", "Is");

    // Filter the first card by User Address
    H.selectDashboardFilter(
      cy.findByTestId("dashcard-container").first(),
      "Address",
    );

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Done").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();
  });

  it("should let admin and nodata users use the filter, and hide filter mapping from nodata users in edit mode", () => {
    filterDashboard();

    cy.signIn("nodata");
    filterDashboard();

    H.editDashboard();

    H.getDashboardCard(0)
      .realHover()
      .findByTestId("dashboardcard-actions-panel")
      .should("be.visible");
    H.getDashboardCard(0).findByLabelText("Add a filter").should("not.exist");

    H.filterWidget({ isEditing: true }).click();
    H.getDashboardCard(0).icon("key").should("be.visible");
  });
});
