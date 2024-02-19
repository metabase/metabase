import { restore, openNativeEditor } from "e2e/support/helpers";

import { STRING_FILTER_SUBTYPES } from "./helpers/e2e-field-filter-data-objects";

import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";

const stringFilters = Object.entries(STRING_FILTER_SUBTYPES);

describe("scenarios > filters > sql filters > field filter > String", () => {
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
      field: "Title",
    });
  });

  it("when set through the filter widget", () => {
    stringFilters.forEach(
      ([subType, { value, representativeResult, isList }]) => {
        cy.log(`Make sure it works for ${subType.toUpperCase()}`);

        FieldFilter.setWidgetType(subType);

        FieldFilter.openEntryForm();

        if (isList) {
          FieldFilter.setWidgetStringFilter(value);
          FieldFilter.selectFilterValueFromList(value);
        } else {
          FieldFilter.addWidgetStringFilter(value);
        }

        SQLFilter.runQuery();

        cy.get(".Visualization").within(() => {
          cy.findByText(representativeResult);
          cy.findByText("Toucan").should("not.exist");
        });
      },
    );
  });

  it("when set as the default value for a required filter", () => {
    SQLFilter.toggleRequired();

    stringFilters.forEach(
      ([subType, { searchTerm, value, representativeResult }], index) => {
        FieldFilter.setWidgetType(subType);

        // When we run the first iteration, there will be no default filter value set
        if (index !== 0) {
          FieldFilter.clearDefaultFilterValue();
        }

        FieldFilter.openEntryForm({ isFilterRequired: true });

        searchTerm
          ? FieldFilter.pickDefaultValue(searchTerm, value)
          : FieldFilter.addDefaultStringFilter(value);

        SQLFilter.runQuery();

        cy.get(".Visualization").within(() => {
          cy.findByText(representativeResult);
          cy.findByText("Toucan").should("not.exist");
        });
      },
    );
  });
});
