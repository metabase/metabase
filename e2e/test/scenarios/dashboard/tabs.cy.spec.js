import {
  editDashboard,
  restore,
  visitDashboard,
  saveDashboard,
  openQuestionsSidebar,
  undo,
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").should("not.exist");

    cy.icon("pencil").click();
    openQuestionsSidebar();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders, Count").click();
    saveDashboard();

    cy.findByRole("tab", { name: "Page 1" }).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders, count").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").should("be.visible");
  });

  it("should allow undoing a tab deletion", () => {
    visitDashboard(1);
    editDashboard();
    createNewTab();

    cy.findByRole("tab", { name: "Page 1" }).findByRole("button").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Delete").click();
    cy.findByRole("tab", { name: "Page 1" }).should("not.exist");

    undo();
    cy.findByRole("tab", { name: "Page 1" }).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders, count").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").should("be.visible");
  });
});
