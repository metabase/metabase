import {
  signInAsAdmin,
  restore,
  openProductsTable,
  popover,
} from "__support__/cypress";

describe("scenarios > question > filter", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it.skip("should load needed data (metabase#12985)", () => {
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
    cy.findByText("You're editing this dashboard.");
    cy.findByText("Save").click();
    cy.findByText("Save").should("not.exist");

    // Check category search
    cy.get(".Icon-empty").should("not.exist");
    cy.findByText("Category").click();
    cy.findByText("Gadget").click();
    cy.findByText("Add filter").click();
  });

  it("should filter a joined table by 'Is not' filter (metabase#13534)", () => {
    // NOTE: the original issue mentions "Is not" and "Does not contain" filters
    // we're testing for one filter only to keep things simple

    // go straight to "orders" in custom questions
    cy.visit("/question/new?database=1&table=2&mode=notebook");
    // join with Products
    cy.findByText("Join data").click();
    cy.findByText("Products").click();
    // add filter
    cy.findByText("Filter").click();
    popover().within(() => {
      // we've run into weird "name normalization" issue
      // where it displays "Product" locally, and "Products" in CI
      // also, we need to eliminate "Product ID" - that's why I used `$`
      cy.contains(/products?$/i).click();
    });
    cy.findByText("Category").click();
    cy.findByText("Is").click();
    cy.findByText("Is not").click();
    cy.findByText("Gizmo").click();
    cy.findByText("Add filter").click();
    cy.contains("Category is not Gizmo");

    cy.findByText("Visualize").click();
    // wait for results to load
    cy.get(".LoadingSpinner").should("not.exist");
    cy.log("**The point of failure in 0.37.0-rc3**");
    cy.contains("37.65");
    cy.findByText("There was a problem with your question").should("not.exist");
    // this is not the point of this repro, but additionally make sure the filter is working as intended on "Gizmo"
    cy.findByText("3621077291879").should("not.exist"); // one of the "Gizmo" EANs
  });
});
