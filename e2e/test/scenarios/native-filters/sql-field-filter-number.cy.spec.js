import { restore, openNativeEditor } from "e2e/support/helpers";

import { NUMBER_FILTER_SUBTYPES } from "./helpers/e2e-field-filter-data-objects";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

const numericFilters = Object.entries(NUMBER_FILTER_SUBTYPES);

describe("scenarios > filters > sql filters > field filter > Number", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();

    openNativeEditor();
    SQLFilter.enterParameterizedQuery("SELECT * FROM products WHERE {{f}}");

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "Products",
      field: "Rating",
    });
  });

  it("when set through the filter widget", () => {
    numericFilters.forEach(([subType, { value, representativeResult }]) => {
      cy.log(`Make sure it works for ${subType.toUpperCase()}`);

      FieldFilter.setWidgetType(subType);

      FieldFilter.openEntryForm();
      FieldFilter.addWidgetNumberFilter(value);

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText(representativeResult);
      });
    });
  });

  it("when set as the default value for a required filter", () => {
    SQLFilter.toggleRequired();

    numericFilters.forEach(
      ([subType, { value, representativeResult }], index) => {
        cy.log(`Make sure it works for ${subType.toUpperCase()}`);

        FieldFilter.setWidgetType(subType);

        FieldFilter.addDefaultNumberFilter(value);

        SQLFilter.runQuery();

        cy.findByTestId("query-visualization-root").within(() => {
          cy.findByText(representativeResult);
        });
      },
    );
  });
});
