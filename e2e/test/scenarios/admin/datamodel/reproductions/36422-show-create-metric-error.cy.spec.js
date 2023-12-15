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
    cy.get('[name="name"]').type("x");
    cy.get('[name="description"]').type("x");

    cy.intercept("POST", "/api/metric", req => req.reply(400));
    cy.button("Save changes").click();
    cy.button("Failed")
      .parent()
      .parent()
      .should("contain", "An error occurred");
  });
});

function selectTable(tableName) {
  cy.findByText("Select a table").click();
  popover().findByText(tableName).click();
}
