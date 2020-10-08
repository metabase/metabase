import { signInAsAdmin, modal, popover, restore } from "__support__/cypress";
// NOTE: some overlap with parameters-embedded.cy.spec.js

describe("scenarios > dashboard > parameters", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  // TODO @nemanjaglumac: refactor and make the test pass
  // [quarantine]: breaking, unclear
  it.skip("should be seeable if previously added", () => {
    // Expand view
    cy.visit("/dashboard/1");
    cy.findByText("Rows 1-1 of 2000");

    // Add a filter
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-funnel_add").click();
    cy.findByText("Location").click();
    cy.findByText("City").click();
    cy.findByText("Select…").click();
    cy.get(".Icon-location").click({ force: true });
    cy.get(".Icon-close");

    // Create default value
    cy.findByText("Enter a default value...").type("B");
    cy.findByText("Baker").click();
    cy.findByText("Add filter").click();
    cy.findByText("Done").click();
    cy.findByText("Save").click({ force: true });
    cy.findByText("Save").should("not.exist");
    cy.findByText("Rows 1-1 of 8");

    // Leave and come back
    cy.get(".Icon")
      .first()
      .click();
    cy.findByText("Browse all items").click();
    cy.findByText("Orders in a dashboard").click();
    cy.findByText("Rows 1-1 of 8");
  });

  it("should search across multiple fields", () => {
    // create a new dashboard
    cy.visit("/");
    cy.get(".Icon-add").click();
    cy.contains("New dashboard").click();
    cy.get(`[name="name"]`).type("my dash");
    cy.contains("button", "Create").click();

    // add the same question twice
    cy.get(".Icon-pencil").click();
    addQuestion("Orders, Count");
    addQuestion("Orders, Count");

    // add a category filter
    cy.get(".Icon-filter").click();
    cy.contains("Other Categories").click();

    // connect it to people.name and product.category
    // (this doesn't make sense to do, but it illustrates the feature)
    selectFilter(cy.get(".DashCard").first(), "Name");
    selectFilter(cy.get(".DashCard").last(), "Category");

    // finish editing filter and save dashboard
    cy.contains("Save").click();

    // wait for saving to finish
    cy.contains("You're editing this dashboard.").should("not.exist");

    // confirm that typing searches both fields
    cy.contains("Category").click();

    // After typing "Ga", you should see this name
    popover()
      .find("input")
      .type("Ga");
    popover().contains("Gabrielle Considine");

    // Continue typing a "d" and you see "Gadget"
    popover()
      .find("input")
      .type("d");
    popover()
      .contains("Gadget")
      .click();

    popover()
      .contains("Add filter")
      .click();

    // There should be 0 orders from someone named "Gadget"
    cy.get(".DashCard")
      .first()
      .contains("0");
    // There should be 4939 orders for a product that is a gadget
    cy.get(".DashCard")
      .last()
      .contains("4,939");
  });
});

function selectFilter(selection, filterName) {
  selection.contains("Select…").click();
  popover()
    .contains(filterName)
    .click({ force: true });
}

function addQuestion(name) {
  cy.get(".DashboardHeader .Icon-add").click();
  modal()
    .contains(name)
    .click();
}
