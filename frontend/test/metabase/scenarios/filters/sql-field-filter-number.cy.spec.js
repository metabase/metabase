import {
  restore,
  mockSessionProperty,
  openNativeEditor,
} from "__support__/e2e/cypress";

import { NUMBER_FILTER_SUBTYPES } from "./helpers/e2e-field-filter-data-objects";

import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";

describe("scenarios > filters > sql filters > field filter > Number", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();
    // Make sure feature flag is on regardles of the environment where this is running.
    mockSessionProperty("field-filter-operators-enabled?", true);

    openNativeEditor();
    SQLFilter.enterParameterizedQuery(
      "SELECT * FROM products WHERE {{filter}}",
    );

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "Products",
      field: "Rating",
    });
  });

  Object.entries(NUMBER_FILTER_SUBTYPES).forEach(
    ([subType, { value, representativeResult }]) => {
      describe(`should work for ${subType}`, () => {
        it("when set through the filter widget", () => {
          FieldFilter.setWidgetType(subType);

          FieldFilter.openEntryForm();
          FieldFilter.addWidgetNumberFilter(value);

          SQLFilter.runQuery();

          cy.get(".Visualization").within(() => {
            cy.findByText(representativeResult);
          });
        });

        it("when set as the default value for a required filter", () => {
          FieldFilter.setWidgetType(subType);

          SQLFilter.toggleRequired();

          FieldFilter.openEntryForm({ isFilterRequired: true });
          FieldFilter.addDefaultNumberFilter(value);

          SQLFilter.runQuery();

          cy.get(".Visualization").within(() => {
            cy.findByText(representativeResult);
          });
        });
      });
    },
  );
});
