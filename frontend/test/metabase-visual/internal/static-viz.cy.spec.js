import { restore } from "__support__/e2e/cypress";

describe("visual tests > internal > static-viz", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("timeseries", () => {
    cy.visit("/_internal/static-viz");
    cy.findByText("Bar chart with timeseries data");
    cy.findByText("Line chart with timeseries data");

    cy.percySnapshot();
  });

  it("donut", () => {
    cy.visit("/_internal/static-viz");
    cy.scrollTo("bottom");

    cy.findByText("Donut chart showing categorical data");

    cy.percySnapshot();
  });
});
