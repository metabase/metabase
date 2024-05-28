import { popover, restore } from "e2e/support/helpers";

describe("issue 5276", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/field/*").as("updateField");
  });

  it("should allow removing the field type (metabase#5276)", () => {
    cy.visit("/reference/databases");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sample Database").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Tables in Sample Database").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Fields in this table").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Score").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("No field type").click());
    cy.button("Save").click();
    cy.wait("@updateField");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Score").should("not.exist");
  });
});
