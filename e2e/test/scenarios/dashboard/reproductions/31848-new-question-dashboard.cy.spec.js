import {
  restore,
  popover,
  modal,
  queryBuilderHeader,
  getDashboardCard,
} from "e2e/support/helpers";

describe("issue 31848", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("createQuestion");
  });

  it("should allow creating questions from an empty dashboard (metabase#31848)", () => {
    const dashboardName = "New dashboard";
    const questionName = "New question";

    cy.visit("/");
    cy.findByTestId("app-bar").findByText("New").click();
    popover().findByText("Dashboard").click();
    modal().within(() => {
      cy.findByLabelText("Name").type(dashboardName);
      cy.button("Create").click();
    });
    cy.findByTestId("dashboard-empty-state")
      .findByText("ask a new one")
      .click();

    popover().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    queryBuilderHeader().findByText("Save").click();
    modal().within(() => {
      cy.findByLabelText("Name").clear().type(questionName);
      cy.button("Save").click();
    });
    cy.wait("@createQuestion");
    modal().within(() => {
      cy.button("Yes please!").click();
      cy.findByText(dashboardName).click();
    });

    cy.findByTestId("edit-bar")
      .findByText("You're editing this dashboard.")
      .should("be.visible");
    getDashboardCard().findByText(questionName).should("be.visible");
  });
});
