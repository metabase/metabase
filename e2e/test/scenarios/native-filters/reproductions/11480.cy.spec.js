import { restore, openNativeEditor } from "e2e/support/helpers";

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
    cy.location("search").should("eq", "?x=some%20text");

    // Run the query and see an error.
    SQLFilter.runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(`Data conversion error converting "some text"`);

    // Oh wait! That doesn't match the total column, so we'll change the parameter to a number.
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");
    cy.location("search").should("eq", "?x=");

    // We cannot run the query unless the default value for a required parameter is set.
    cy.findByTestId("native-query-editor-sidebar")
      .button("Get Answer")
      .should("be.disabled");
  });
});
