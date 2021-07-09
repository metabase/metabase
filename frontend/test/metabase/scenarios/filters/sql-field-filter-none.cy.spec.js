import {
  restore,
  mockSessionProperty,
  openNativeEditor,
  filterWidget,
} from "__support__/e2e/cypress";

import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";

describe("scenarios > filters > sql filters > field filter > None", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();
    // Make sure feature flag is on regardless of the environment where this is running
    mockSessionProperty("field-filter-operators-enabled?", true);

    openNativeEditor();
    SQLFilter.enterParameterizedQuery(
      "SELECT * FROM products WHERE {{filter}}",
    );

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "Products",
      field: "Category",
    });

    FieldFilter.setWidgetType("None");

    filterWidget().should("not.exist");
  });

  it("should successfully run the query and show all results", () => {
    SQLFilter.runQuery();

    cy.get(".Visualization").within(() => {
      cy.findByText("Rustic Paper Wallet");
    });

    cy.findByText("Showing 200 rows");
  });

  it.skip("should let you change the field filter type to something else and restore the filter widget (metabase#13825)", () => {
    FieldFilter.setWidgetType("String contains");

    FieldFilter.openEntryForm();
    FieldFilter.addWidgetStringFilter("zm");

    SQLFilter.runQuery();

    cy.get(".Visualization").within(() => {
      cy.findByText("Rustic Paper Wallet");
    });
  });
});
