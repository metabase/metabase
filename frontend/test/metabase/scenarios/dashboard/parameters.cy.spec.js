import { signInAsAdmin, modal, popover, restore } from "__support__/cypress";
// NOTE: some overlap with parameters-embedded.cy.spec.js

describe("scenarios > dashboard > parameters", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should be visible if previously added", () => {
    cy.visit("/dashboard/1");
    cy.findByText("Rows 1-1 of 2000");

    // Add a filter
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-filter").click();
    cy.findByText("Location").click();
    cy.findByText("City").click();

    // Link that filter to the card
    cy.findByText("Select…").click();
    popover().within(() => {
      cy.findByText("City").click();
    });

    // Create a default value and save filter
    cy.findByText("No default").click();
    cy.findByPlaceholderText("Search by City")
      .click()
      .type("B");
    cy.findByText("Baker").click();
    cy.findByText("Add filter").click();
    cy.get(".Button--primary")
      .contains("Done")
      .click();

    cy.findByText("Save").click();
    cy.findByText("You're editing this dashboard.").should("not.exist");
    cy.findByText("Rows 1-1 of 8");

    cy.log(
      "**Filter should be set and applied after we leave and back to the dashboard**",
    );
    cy.visit("/");
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

  it.skip("should remove previously deleted dashboard parameter from URL (metabase#10829)", () => {
    // Mirrored issue in metabase-enterprise#275

    // Go directly to "Orders in a dashboard" dashboard
    cy.visit("/dashboard/1");

    // Add filter and save dashboard
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-filter").click();
    cy.contains("Other Categories").click();
    cy.findByText("Save").click();

    // Give value to the filter
    cy.findByPlaceholderText("Category")
      .click()
      .type("Gizmo{enter}");
    cy.log(
      "**URL is updated correctly with the given parameter at this point**",
    );
    cy.url().should("include", "category=Gizmo");

    // Remove filter and save dashboard
    cy.get(".Icon-pencil").click();
    cy.get(".Dashboard .Icon-gear").click();
    cy.findByText("Remove").click();
    cy.findByText("Save").click();

    cy.log("**URL should not include deleted parameter**");
    cy.url().should("not.include", "category=Gizmo");
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
