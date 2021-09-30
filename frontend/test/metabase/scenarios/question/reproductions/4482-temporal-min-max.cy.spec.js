import { restore } from "__support__/e2e/cypress";

describe("issue 4482", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be possible to summarize min of a temporal column (metabase#6239)", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Products").click();

    cy.contains("Pick the metric").click();

    cy.contains("Minimum of").click();
    cy.findByText("Price");
    cy.findByText("Rating");
    cy.contains("Created At").click();

    cy.button("Visualize").click();
  });

  it("should be possible to summarize max of a temporal column (metabase#6239)", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Products").click();

    cy.contains("Pick the metric").click();

    cy.contains("Maximum of").click();
    cy.findByText("Price");
    cy.findByText("Rating");
    cy.contains("Created At").click();

    cy.button("Visualize").click();
  });

  it("should be not possible to average a temporal column (metabase#6239)", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Products").click();

    cy.contains("Pick the metric").click();

    cy.contains("Average of").click();
    cy.findByText("Price");
    cy.findByText("Rating");
    cy.findByText("Created At").should("not.exist");
  });
});
