import {
  signInAsAdmin,
  restore,
  openProductsTable,
  popover,
} from "__support__/cypress";

describe("scenarios > question > filter", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it.skip("should load needed data (Issue #12985)", () => {
    // Save a Question
    openProductsTable();
    cy.findByText("Save").click();
    cy.findByPlaceholderText("What is the name of your card?")
      .clear()
      .type("Q1");
    cy.findAllByText("Save")
      .last()
      .click();
    cy.findByText("Not now").click();

    // From Q1, save Q2
    cy.visit("/question/new");
    cy.findByText("Simple question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("Q1").click();
    cy.findByText("Save").click();
    cy.findByPlaceholderText("What is the name of your card?")
      .clear()
      .type("Q2");
    cy.findAllByText("Save")
      .last()
      .click();

    // Add Q2 to a dashboard
    cy.findByText("Yes please!").click();
    cy.get(".Icon-dashboard").click();

    // Add two dashboard filters
    cy.get(".Icon-funnel_add").click();
    cy.findByText("Time").click();
    cy.findByText("All Options").click();
    cy.findAllByText("Select…")
      .last()
      .click();
    cy.findByText("Created At").click();

    cy.get(".Icon-funnel_add").click();
    cy.findByText("Other Categories").click();
    cy.findAllByText("Select…")
      .last()
      .click();
    popover().within(() => {
      cy.findByText("Category").click();
    });

    // Save dashboard and refresh page
    cy.findByText("Done").click();
    cy.findByText("You are editing a dashboard");
    cy.findByText("Save").click();
    cy.findByText("Save").should("not.exist");

    // Check category search
    cy.get(".Icon-empty").should("not.exist");
    cy.findByText("Category").click();
    cy.findByText("Gadget").click();
    cy.findByText("Add filter").click();
  });
});
