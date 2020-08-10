import {
  signInAsAdmin,
  modal,
  popover,
  restore,
  openOrdersTable,
  sidebar,
} from "__support__/cypress";

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

  it.skip("should link to custom questions with filtered aggregate data (Issue #11007)", () => {
    openOrdersTable();

    // Add filter to question
    cy.findByText("Filter").click();
    cy.findAllByText("1");
    sidebar().within(() => {
      cy.contains("Filter by");
      cy.contains("Cancel");

      cy.contains("User ID").click();
      cy.get("input")
        .last()
        .type("1");
      cy.get(".Button").click();
    });
    cy.findByText("User ID is 1");
    cy.findByText("Filter by").should("not.exist");

    // Add first summary param to question
    cy.findAllByText("Summarize")
      .first()
      .click();
    sidebar().within(() => {
      cy.contains("Summarize by");
      cy.contains("Count").click();
    });
    popover().within(() => {
      cy.contains("Sum of").click();
      cy.findByText("Total").click();
    });

    sidebar().within(() => {
      cy.contains("Created At").click();
      cy.contains("by month").click();
    });
    cy.findByText("Day").click();

    // Add second summary param to question
    cy.findByText("Product ID")
      .parent()
      .parent()
      .parent()
      .within(() => {
        cy.get(".Icon-add").click({ force: true });
      });

    // Add third summary param to question
    cy.get(".full-height .scroll-y").scrollTo("bottom");
    cy.findByText("Category")
      .parent()
      .parent()
      .parent()
      .within(() => {
        cy.get(".Icon-add").click({ force: true });
      });

    cy.findByText("Done").click();
    cy.findByText("Summarize by").should("not.exist");

    // Add aggregation filter
    cy.findAllByText("Filter")
      .first()
      .click();
    sidebar().within(() => {
      cy.contains("Filter by");

      cy.contains("Sum of Total").click();
      cy.contains("Equal to").click();
    });
    cy.findByText("Greater than").click();
    cy.findByPlaceholderText("Enter a number").type("100");
    cy.findByText("Add filter");

    // Save and add to dashboard
    cy.findByText("Save").click();
    cy.findByPlaceholderText("What is the name of your card?").type(
      "Test Question",
    );
    cy.findAllByText("Save")
      .last()
      .click();
    cy.findByText("Yes please!").click();
    cy.findByText("Orders in a dashboard").click();

    // Add first dashboard filter
    cy.get(".Icon-funnel_add").click();
    cy.findByText("Time").click();
    cy.findByText("All Options").click();
    selectFilterItem("Created At");

    // Add second dashboard filter
    cy.get(".Icon-funnel_add").click();
    cy.findByText("ID").click();
    selectFilterItem("Product ID");

    // Add third dashboard filter
    cy.get(".Icon-funnel_add").click();
    cy.findByText("Other Categories").click();
    selectFilterItem("Category");

    cy.findByText("Done").click();
    cy.findByText("Save").click();
    cy.findByText("Rows 1-2 of 11");

    // Try to filter
    cy.findByPlaceholderText("Category").type("Widget{enter}");
    cy.findByText("Rows 1-2 of 11").should("not.exist");
    cy.findByText("Rows 1-2 of 6");
    cy.pause();
  });
});

function selectFilterItem(filterItem) {
  cy.findAllByText("Select…")
    .last()
    .click();
  cy.findAllByText(filterItem)
    .first()
    .click();
}

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
