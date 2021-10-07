import { restore, popover } from "__support__/e2e/cypress";

describe("issue 13098", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should allow changing binning for aggregation (metabase#13098)", () => {
    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Products").click();

    cy.findByText("Pick the metric you want to see").click();
    cy.findByText("Number of distinct values of ...").click();

    popover()
      .findByText("Created At")
      .closest(".List-item")
      .findByText("by month")
      .click({ force: true });
    cy.findByText("Quarter").click();

    cy.button("Visualize").click();
    cy.wait("@dataset");
    cy.findByText("13");
  });
});
