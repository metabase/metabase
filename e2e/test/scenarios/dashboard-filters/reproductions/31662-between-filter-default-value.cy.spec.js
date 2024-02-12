import { editDashboard, popover, restore, sidebar } from "e2e/support/helpers";

const parameterDetails = {
  name: "Between",
  slug: "between",
  id: "b6ed2d71",
  type: "number/between",
  sectionId: "number",
  default: [3, 5],
};

const dashboardDetails = {
  name: "Dashboard",
  parameters: [parameterDetails],
};

describe("issue 31662", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("/api/dashboard/*").as("dashboard");
  });

  it("should allow setting default values for a not connected between filter (metabase#31662)", () => {
    cy.createDashboard(dashboardDetails).then(
      ({ body: { id: dashboardId } }) => {
        cy.visit(`dashboard/${dashboardId}?between=10&between=20`);
        cy.wait("@dashboard");
      },
    );
    cy.findByTestId("dashboard-empty-state").should("be.visible");
    editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Between")
      .click();
    sidebar().findByText("2 selections").click();
    popover().within(() => {
      cy.findByDisplayValue("3").should("be.visible");
      cy.findByDisplayValue("5").should("be.visible");
    });
  });
});
