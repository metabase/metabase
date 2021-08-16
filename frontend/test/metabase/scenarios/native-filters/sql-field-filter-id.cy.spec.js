import {
  restore,
  mockSessionProperty,
  openNativeEditor,
} from "__support__/e2e/cypress";

import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";

describe("scenarios > filters > sql filters > field filter > ID", () => {
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
      field: "ID",
    });

    FieldFilter.setWidgetType("ID");
  });

  it("should work when set initially as default value and then through the filter widget", () => {
    SQLFilter.toggleRequired();

    FieldFilter.openEntryForm({ isFilterRequired: true });
    FieldFilter.addDefaultStringFilter("2");

    SQLFilter.runQuery();

    cy.get(".Visualization").within(() => {
      cy.findByText("Small Marble Shoes");
    });

    FieldFilter.openEntryForm();
    FieldFilter.addWidgetStringFilter("1");

    SQLFilter.runQuery();

    cy.get(".Visualization").within(() => {
      cy.findByText("Rustic Paper Wallet");
    });
  });
});
