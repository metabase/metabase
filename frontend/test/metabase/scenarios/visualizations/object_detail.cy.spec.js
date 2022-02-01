import { restore } from "__support__/e2e/cypress";

describe("scenarios > visualizations > object detail", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should show orders/reviews connected to a product", () => {
    cy.visit("/browse/1");
    cy.contains("Products").click();
    // click on product #1's id
    cy.contains(/^1$/).click();
    // check that the correct counts of related tables appear
    cy.contains("Orders").parent().contains("93");
    cy.contains("Reviews").parent().contains("8");
  });

  it("should show the correct filter when clicking through on a fk", () => {
    cy.visit("/browse/1");
    cy.findByText("Products").click();
    cy.findByText("1").click();
    cy.findByText("Orders").parent().findByText("93").click();
    cy.findByText("Product ID is 1");
  });

  it("should allow clicking the next arrow", () => {
    cy.visit("/browse/1");
    cy.findByText("Products").click();
    cy.findByText("1").click();
    cy.get(".Icon-arrow_right").click();
    cy.findByText("Small Marble Shoes");
  });
});
