import { popover, restore } from "__support__/e2e/helpers";

describe("issue 5276", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/field/*").as("updateField");
  });

  it("should allow removing the field type (metabase#5276)", () => {
    cy.visit("/reference/databases");

    cy.findByText("Sample Database").click();
    cy.findByText("Tables in Sample Database").click();
    cy.findByText("Products").click();
    cy.findByText("Fields in this table").click();
    cy.findByText("Edit").click();

    cy.findByText("Score").click();
    popover().within(() => cy.findByText("No field type").click());
    cy.button("Save").click();
    cy.wait("@updateField");
    cy.findByText("Score").should("not.exist");
  });
});
