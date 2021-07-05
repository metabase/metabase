import {
  restore,
  mockSessionProperty,
  openNativeEditor,
} from "__support__/e2e/cypress";

import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";

const NUMBER_FILTER_SUBTYPES = {
  "Equal to": {
    term: "4.3",
    representativeResult: "Aerodynamic Linen Coat",
  },
  "Not equal to": {
    term: "4.3",
    representativeResult: "Rustic Paper Wallet",
  },
  Between: {
    term: ["4.3", "5"],
    representativeResult: "Rustic Paper Wallet",
  },
  "Greater than or equal to": {
    term: "4.3",
    representativeResult: "Rustic Paper Wallet",
  },
  "Less than or equal to": {
    term: "4.3",
    representativeResult: "Small Marble Shoes",
  },
};

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
    ([subType, { term, representativeResult }]) => {
      describe(`should work for ${subType}`, () => {
        it("when set through the filter widget", () => {
          FieldFilter.setWidgetType(subType);

          FieldFilter.openEntryForm();
          FieldFilter.addWidgetNumberFilter(term);

          SQLFilter.runQuery();

          cy.get(".Visualization").within(() => {
            cy.findByText(representativeResult);
          });
        });

        it("when set as the default value for a required filter", () => {
          FieldFilter.setWidgetType(subType);

          SQLFilter.toggleRequired();

          FieldFilter.openEntryForm({ isFilterRequired: true });
          FieldFilter.addDefaultNumberFilter(term);

          SQLFilter.runQuery();

          cy.get(".Visualization").within(() => {
            cy.findByText(representativeResult);
          });
        });
      });
    },
  );
});
