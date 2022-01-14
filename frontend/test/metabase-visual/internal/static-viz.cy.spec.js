import { restore } from "__support__/e2e/cypress";

describe("visual tests > internal > static-viz", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("basic charts", () => {
    cy.visit("/_internal/static-viz");

    cy.findByText("Bar chart with timeseries data");
    cy.findByText("Line chart with timeseries data");
    cy.findByText("Donut chart with categorical data");

    cy.percySnapshot();
  });
});
