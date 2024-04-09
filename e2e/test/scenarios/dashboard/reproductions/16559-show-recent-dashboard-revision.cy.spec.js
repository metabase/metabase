import {
  dashboardHeader,
  editDashboard,
  openQuestionsSidebar,
  popover,
  restore,
  sidebar,
  rightSidebar,
  toggleDashboardInfoSidebar,
  visitDashboard,
  entityPickerModal,
} from "e2e/support/helpers";

const dashboardDetails = {
  name: "16559 Dashboard",
};

describe("issue 16559", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createDashboard(dashboardDetails).then(
      ({ body: { id: dashboardId } }) => {
        visitDashboard(dashboardId);
      },
    );
  });

  it("should always show the most recent revision (metabase#16559)", () => {
    toggleDashboardInfoSidebar();

    cy.log("Dashboard creation");
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText("You created this.")
      .should("be.visible");

    cy.log("Edit dashboard");
    editDashboard();
    openQuestionsSidebar();
    sidebar().findByText("Orders, Count").click();
    cy.button("Save").click();
    toggleDashboardInfoSidebar();
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText("You added a card.")
      .should("be.visible");

    cy.log("Change dashboard name");
    cy.findByTestId("dashboard-name-heading").click().type(" modified").blur();
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText(
        'You renamed this Dashboard from "16559 Dashboard" to "16559 Dashboard modified".',
      )
      .should("be.visible");

    cy.log("Add description");
    cy.findByPlaceholderText("Add description")
      .click()
      .type("16559 description")
      .blur();
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText("You added a description.")
      .should("be.visible");

    cy.log("Toggle auto-apply filters");
    rightSidebar().findByText("Auto-apply filters").click();
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText("You set auto apply filters to false.")
      .should("be.visible");

    cy.log("Move dashboard to another collection");
    dashboardHeader().icon("ellipsis").click();
    popover().findByText("Move").click();
    entityPickerModal().within(() => {
      cy.findByText("First collection").click();
      cy.button("Move").click();
    });
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText("You moved this Dashboard to First collection.")
      .should("be.visible");
  });
});
