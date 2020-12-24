import {
  signInAsAdmin,
  restore,
  addPostgresDatabase,
  popover,
} from "__support__/cypress";

const PG_DB_NAME = "QA Postgres12";

describe("postgres > user > query", () => {
  before(() => {
    restore();
    signInAsAdmin();
    addPostgresDatabase(PG_DB_NAME);
  });

  it("should show row details when clicked on its entity key (metabase#13263)", () => {
    cy.visit("/question/new");
    cy.findByText("Simple question").click();
    cy.findByText(PG_DB_NAME).click();
    cy.findByText("Orders").click();

    // We're clicking on ID: 1 (the first order) => do not change!
    // It is tightly coupled to the assertion ("37.65"), which is "Subtotal" value for that order.
    cy.get(".Table-ID")
      .eq(0)
      .click();

    // Wait until "doing science" spinner disappears (DOM is ready for assertions)
    // TODO: if this proves to be reliable, extract it as a helper function for waiting on DOM to render
    cy.get(".LoadingSpinner").should("not.exist");

    // Assertions
    cy.log("**Fails in v0.36.6**");
    // This could be omitted because real test is searching for "37.65" on the page
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.contains("37.65");
  });

  it.skip("should properly switch visualization to pivot table (metabase#14148)", () => {
    cy.server();
    cy.route("POST", "/api/advanced_computation/pivot/dataset").as(
      "pivotDataset",
    );

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText(PG_DB_NAME).click();
    cy.findByText("Products").click();
    cy.findByText("Pick the metric you want to see").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    popover().within(() => {
      cy.findByText("Category").click();
    });
    cy.get(".Icon-add")
      .last()
      .click();
    popover().within(() => {
      cy.findByText("Created At").click();
    });

    cy.findByText("Visualize").click();

    cy.findByText("Visualization").click();
    cy.get(".Icon-pivot_table").click({ force: true });
    cy.log(
      "**Reported failing on v0.38.0-rc1 querying Postgres, Redshift and BigQuery. It works on MySQL and H2.**",
    );
    cy.wait("@pivotDataset").then(xhr => {
      expect(xhr.response.body.cause).not.to.contain("ERROR");
    });
    cy.findByText(/Grand totals/i);
    cy.findByText("200");
  });
});
