import { restore, openNativeEditor } from "__support__/e2e/cypress";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";

describe("issue 11480", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should clear a template tag's default value when the type changes (metabase#11480)", () => {
    openNativeEditor();
    // Parameter `x` defaults to a text parameter.
    SQLFilter.enterParameterizedQuery(
      "select * from orders where total = {{x}}",
    );

    // Mark field as required and add a default text value.
    SQLFilter.toggleRequired();
    SQLFilter.setDefaultValue("some text");

    // Run the query and see an error.
    SQLFilter.runQuery();
    cy.contains(`Data conversion error converting "some text"`);

    // Oh wait! That doesn't match the total column, so we'll change the parameter to a number.
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");

    // When we run it again, the default has been cleared out so we get the right error.
    SQLFilter.runQuery();
    cy.contains(
      "You'll need to pick a value for 'X' before this query can run.",
    );
  });
});
