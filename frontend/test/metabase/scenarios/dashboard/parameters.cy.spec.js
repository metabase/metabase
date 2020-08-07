import { signInAsAdmin, modal, popover, restore, openOrdersTable } from "__support__/cypress";

// NOTE: some overlap with parameters-embedded.cy.spec.js

describe("scenarios > dashboard > parameters", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should search across multiple fields", () => {
    // create a new dashboard
    cy.visit("/");
    cy.get(".Icon-add").click();
    cy.contains("New dashboard").click();
    cy.get(`[name="name"]`).type("my dash");
    cy.contains("button", "Create").click();

    // add the same question twice
    addQuestion("Orders, Count");
    addQuestion("Orders, Count");

    // add a category filter
    cy.get(".Icon-funnel_add").click();
    cy.contains("Other Categories").click();

    // connect it to people.name and product.category
    // (this doesn't make sense to do, but it illustrates the feature)
    selectFilter(cy.get(".DashCard").first(), "Name");
    selectFilter(cy.get(".DashCard").last(), "Category");

    // finish editing filter and save dashboard
    cy.contains("Done").click();
    cy.contains("Save").click();

    // wait for saving to finish
    cy.contains("You are editing a dashboard").should("not.exist");

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

  it.only("should filter on a UNIX timestamp", () => {
    // Set datatype of Quantity to UNIX Timestamp
    cy.visit("/admin/datamodel/database/1/table/2");
    cy.findByText("Quantity").click();
    cy.scrollTo("bottom");
    cy.findByText("UNIX Timestamp (Seconds)").click();

    // Create a question
    openOrdersTable();
    cy.findByText("Summarize").click();
    cy.findByText("Summarize by");
    cy.findByText("Done").click();

    // Add to a dashboard
    cy.findByText("Save").click();
    cy.findAllByText("Save")
      .last()
      .click();
    cy.findByText("Yes please!").click();
    cy.findByText("Create a new dashboard").click();
    cy.findByPlaceholderText("What is the name of your dashboard?")
      .type("Test Dashboard")
    cy.findByText("Create").click();

    // Add filter
    cy.get(".Icon-funnel_add").click();
    cy.findByText("Time").click();
    cy.findByText("Relative Date").click();

    cy.findByText("Select…").click();
    cy.get(".List-item .cursor-pointer")
      .first()
      .click({ force: true });
    cy.findByText("Select…").should("not.exist");
    
    cy.findByText("Select a default value…").click();
    cy.findByText("Yesterday").click();

    // Save dashboard
    cy.findByText("Done").click();
    cy.findByText("Save").click({ force: true });
    cy.findByText("Save").should("not.exist");
    cy.findByText("0");

    // Open dashboard from collections
    cy.visit("/collection/root");
    cy.findByText("Test Dashboard").click();
    cy.findByText("Relative Date");
    cy.findByText("18,760").should("not.exist");
    cy.findByText("0");
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
