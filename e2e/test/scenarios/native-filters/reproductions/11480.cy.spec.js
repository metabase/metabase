import { restore, openNativeEditor } from "e2e/support/helpers";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";

describe("issue 11480", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  // TODO: does this test make sense to keep anymore?
  it("should clear a template tag's default value when the type changes (metabase#11480)", () => {
    openNativeEditor();
    // Parameter `x` defaults to a text parameter.
    SQLFilter.enterParameterizedQuery(
      "select * from orders where total = {{x}}",
    );

    // Mark field as required and add a default text value.
    SQLFilter.toggleRequired();
    SQLFilter.setDefaultValue("some text");

    // Reload the question with the new default and see an error.
    SQLFilter.saveNewQuestion();
    SQLFilter.reloadWithoutQueryParams();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(`Data conversion error converting "some text"`);

    cy.findByTestId("native-query-editor-container").within(() => {
      cy.findByText("Open Editor").click();
      cy.icon("variable").click();
    });

    // Oh wait! That doesn't match the total column, so we'll change the parameter to a number.
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");

    // When we reload again, the default has been cleared out so we get the right error.
    SQLFilter.saveExistingQuestion();
    SQLFilter.reloadWithoutQueryParams();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(
      "You'll need to pick a value for 'X' before this query can run.",
    );
  });
});
