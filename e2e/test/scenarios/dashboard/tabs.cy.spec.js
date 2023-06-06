import {
  restore,
  saveDashboard,
  openQuestionsSidebar,
  undo,
  dashboardCards,
  sidebar,
  popover,
  visitDashboardAndCreateTab,
} from "e2e/support/helpers";

describe("scenarios > dashboard tabs", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should only display cards on the selected tab", () => {
    // Create new tab
    visitDashboardAndCreateTab({ dashboardId: 1, save: false });
    dashboardCards().within(() => {
      cy.findByText("Orders").should("not.exist");
    });

    // Add card to second tab
    cy.icon("pencil").click();
    openQuestionsSidebar();
    sidebar().within(() => {
      cy.findByText("Orders, Count").click();
    });
    saveDashboard();

    // Go back to first tab
    cy.findByRole("tab", { name: "Page 1" }).click();
    dashboardCards().within(() => {
      cy.findByText("Orders, count").should("not.exist");
    });
    dashboardCards().within(() => {
      cy.findByText("Orders").should("be.visible");
    });
  });

  it("should allow undoing a tab deletion", () => {
    visitDashboardAndCreateTab({ dashboardId: 1, save: false });

    // Delete first tab
    cy.findByRole("tab", { name: "Page 1" }).findByRole("button").click();
    popover().within(() => {
      cy.findByText("Delete").click();
    });
    cy.findByRole("tab", { name: "Page 1" }).should("not.exist");

    // Undo then go back to first tab
    undo();
    cy.findByRole("tab", { name: "Page 1" }).click();
    dashboardCards().within(() => {
      cy.findByText("Orders").should("be.visible");
    });
  });
});
