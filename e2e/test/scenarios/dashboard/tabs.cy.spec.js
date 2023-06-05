import {
  editDashboard,
  restore,
  visitDashboard,
  saveDashboard,
  openQuestionsSidebar,
  undo,
  dashboardCards,
  sidebar,
  popover,
} from "e2e/support/helpers";

function createNewTab() {
  cy.findByLabelText("Create new tab").click();
}

describe("scenarios > dashboard tabs", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should only display cards on the selected tab", () => {
    visitDashboard(1);

    editDashboard();
    createNewTab();
    dashboardCards().within(() => {
      cy.findByText("Orders").should("not.exist");
    });

    cy.icon("pencil").click();
    openQuestionsSidebar();
    sidebar().within(() => {
      cy.findByText("Orders, Count").click();
    });
    saveDashboard();

    cy.findByRole("tab", { name: "Tab 1" }).click();
    dashboardCards().within(() => {
      cy.findByText("Orders, count").should("not.exist");
    });
    dashboardCards().within(() => {
      cy.findByText("Orders").should("be.visible");
    });
  });

  it("should allow undoing a tab deletion", () => {
    visitDashboard(1);
    editDashboard();
    createNewTab();

    cy.findByRole("tab", { name: "Tab 1" }).findByRole("button").click();
    popover().within(() => {
      cy.findByText("Delete").click();
    });
    cy.findByRole("tab", { name: "Tab 1" }).should("not.exist");

    undo();
    cy.findByRole("tab", { name: "Tab 1" }).click();

    dashboardCards().within(() => {
      cy.findByText("Orders, count").should("not.exist");
    });
    dashboardCards().within(() => {
      cy.findByText("Orders").should("be.visible");
    });
  });
});
