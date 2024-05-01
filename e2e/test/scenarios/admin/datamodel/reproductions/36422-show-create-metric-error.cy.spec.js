import { popover, restore } from "e2e/support/helpers";

describe("issue 36422", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show error and disable save button when create metric fails", () => {
    cy.visit("/admin/datamodel/metrics");
    cy.button("New metric").click();
    selectTable("Orders");
    cy.findByLabelText("Name Your Metric").type("x");
    cy.findByLabelText("Describe Your Metric").type("x");

    cy.intercept("POST", "/api/legacy-metric", req => req.reply(400));
    cy.button("Save changes").click();
    cy.findByRole("alert", { name: "An error occurred" }).should("be.visible");
  });
});

function selectTable(tableName) {
  cy.findByText("Select a table").click();
  popover().findByText(tableName).click();
}
