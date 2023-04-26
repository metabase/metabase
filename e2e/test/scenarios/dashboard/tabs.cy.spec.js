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
    cy.findByText("Orders").should("not.exist");

    cy.icon("pencil").click();
    openQuestionsSidebar();
    cy.findByText("Orders, Count").click();
    saveDashboard();

    cy.findByRole("tab", { name: "Page 1" }).click();
    cy.findByText("Orders, count").should("not.exist");
    cy.findByText("Orders").should("be.visible");
  });
});
