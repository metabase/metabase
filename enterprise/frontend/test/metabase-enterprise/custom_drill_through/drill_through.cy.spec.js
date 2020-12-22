import { signIn, signInAsAdmin, restore, modal } from "__support__/cypress";

// Drill-through support has been replaced with custom dashboard destinations
describe.skip("drill through", () => {
  before(restore);

  beforeEach(signInAsAdmin);
  it("sets drill through link for dots in a line graph", () => {
    cy.visit("/question/3");
    cy.contains("Settings").click();
    cy.contains("Drill-through")
      .scrollIntoView()
      .click();
    cy.contains("Go to a custom link").click();
    cy.contains("Link template")
      .parent()
      .find("input")
      // We need to use a relative URL because otherwise it opens in a new tab
      // and Cypress can't see it.
      .type("/?count={{count}}", { parseSpecialCharSequences: false });
    cy.contains("Done").click();

    // save it, so it can be used in the next test
    cy.contains("Save").click();
    modal()
      .find(".Button--primary")
      .click();

    // We need this force because the chart is animating. If we let Cypress wait
    // for actionability, the dot will have been removed before it's clicked.
    cy.get(".dot:first").click({ force: true });
    cy.url().should("match", /\?count=744/);
  });

  it("should allow custom drill through without data permissions", () => {
    signIn("nodata");
    cy.visit("/question/3");
    cy.get(".dot:first").click({ force: true });
    cy.url().should("match", /\?count=744/);
  });

  xit("sets drill through link for value in table", () => {
    cy.visit("/browse/1");
    cy.contains("Orders").click();

    // turn on link display for created at
    cy.contains("Settings").click();
    cy.contains("Visible columns")
      .parent()
      .contains("Created At")
      .next()
      .click();
    cy.contains("Display as link")
      .next()
      .click();
    cy.get(".PopoverContainer")
      .contains("Link")
      .click();

    // enter templates
    cy.contains("Link template")
      .parent()
      .find("input")
      .type("http://example.com/?order={{id}}&product={{product_id}}", {
        parseSpecialCharSequences: false,
      });
    cy.contains("Link text")
      .parent()
      .find("input")
      .type("link-text-{{subtotal}}", { parseSpecialCharSequences: false });
    cy.contains("Done").click();

    // confirm templated values appear
    cy.contains("link-text-110.93").should(
      "have.attr",
      "href",
      "http://example.com/?order=2&product=123",
    );
  });
});
