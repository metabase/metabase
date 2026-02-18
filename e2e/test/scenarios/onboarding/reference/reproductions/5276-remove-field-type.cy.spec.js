const { H } = cy;

describe("issue 5276", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/field/*").as("updateField");
  });

  it("should allow removing the field type (metabase#5276)", () => {
    cy.visit("/reference/databases");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sample Database").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Tables in Sample Database").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Fields in this table").click();

    // Calling .click on this element goes into edit more and immediately calls resetForm to pull us back out
    // no idea why. TODO: Fix
    cy.button(/Edit/).trigger("click");

    cy.findByDisplayValue("Score").click();
    H.popover().findByText("No semantic type").click();
    cy.button("Save").click();
    cy.wait("@updateField");
    cy.findByDisplayValue("Score").should("not.exist");
  });
});
