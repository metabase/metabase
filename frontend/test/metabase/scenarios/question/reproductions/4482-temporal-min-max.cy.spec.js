import { restore, visualize, startNewQuestion } from "__support__/e2e/helpers";

describe("issue 4482", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    startNewQuestion();
    cy.contains("Sample Database").click();
    cy.contains("Products").click();
  });

  it("should be possible to summarize min of a temporal column (metabase#4482-1)", () => {
    pickMetric("Minimum of");

    cy.contains("Created At").click();

    visualize();

    cy.findByText("April 1, 2016, 12:00 AM");
  });

  it("should be possible to summarize max of a temporal column (metabase#4482-2)", () => {
    pickMetric("Maximum of");

    cy.contains("Created At").click();

    visualize();

    cy.findByText("April 1, 2019, 12:00 AM");
  });

  it("should be not possible to average a temporal column (metabase#4482-3)", () => {
    pickMetric("Average of");

    cy.findByText("Created At").should("not.exist");
  });
});

function pickMetric(metric) {
  cy.contains("Pick the metric").click();

  cy.contains(metric).click();
  cy.findByText("Price");
  cy.findByText("Rating");
}
