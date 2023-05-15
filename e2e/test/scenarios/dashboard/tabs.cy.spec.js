import {
  editDashboard,
  restore,
  visitDashboard,
  saveDashboard,
  openQuestionsSidebar,
} from "e2e/support/helpers";

describe("scenarios > dashboard tabs", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should only display cards on the selected tab", () => {
    visitDashboard(1);

    editDashboard();
    cy.findByLabelText("Create new tab").click();
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
});
