//Replaces HomepageApp.e2e.spec.js
import { restore, openProductsTable, popover } from "__support__/e2e/cypress";

describe("metabase > scenarios > home > activity-page", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show test startup activity ", () => {
    cy.visit("/activity");
    cy.findByText("Activity");
    cy.findByText("Metabase is up and running.");
    cy.contains("added a question to the dashboard - Orders in a dashboard");
  });

  it("should show new activity", () => {
    cy.signInAsNormalUser();

    // Make and a save new question
    openProductsTable();
    cy.findByText("Rating").click();
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Enter a number").type("5");
      cy.findByText("Update filter").click();
    });
    cy.findByText("Save").click();
    cy.get("[value='Products, Filtered by Rating']");
    cy.findAllByText("Save")
      .last()
      .click();
    cy.findByText("Not now").click();

    // View a dashboard
    cy.visit("/collection/root?type=dashboard");
    cy.findByText("Orders in a dashboard").click();
    cy.findByText("My personal collection").should("not.exist");
    cy.findByText("Orders");
    cy.get(".Card").should("have.length", 1);

    // See activity on activity page
    cy.signInAsAdmin();
    cy.visit("/activity");

    cy.findAllByText("joined!").should("have.length", 2);
    cy.findAllByText("Robert").should("have.length", 2);
    cy.findByText("Products, Filtered by Rating");
  });
});
