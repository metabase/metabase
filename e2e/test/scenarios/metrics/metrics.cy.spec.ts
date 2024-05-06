import { popover, restore } from "e2e/support/helpers";

describe("scenarios > metrics", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should create a metric for a table", () => {
    cy.visit("/");
    cy.findByTestId("app-bar").findByText("New").click();
    popover().findByText("Metric");
  });
});
