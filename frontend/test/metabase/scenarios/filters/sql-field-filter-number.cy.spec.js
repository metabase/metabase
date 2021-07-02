import {
  restore,
  mockSessionProperty,
  openNativeEditor,
} from "__support__/e2e/cypress";

import {
  enterNativeQuery,
  mapFieldFilterTo,
  openPopoverFromDefaultFilterType,
  runQuery,
  setFilterType,
  setFilterWidgetType,
  setFieldFilterWidgetValue,
  setRequiredFieldFilterDefaultValue,
} from "./filters-e2e-helpers";

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
    enterNativeQuery("SELECT * FROM products WHERE {{filter}}");

    openPopoverFromDefaultFilterType();
    setFilterType("Field Filter");

    mapFieldFilterTo({
      table: "Products",
      field: "Rating",
    });
  });

  Object.entries(NUMBER_FILTER_SUBTYPES).forEach(
    ([subType, { term, representativeResult }]) => {
      describe(`should work for ${subType}`, () => {
        it("when set through the filter widget", () => {
          setFilterWidgetType(subType);

          setFieldFilterWidgetValue(term);

          runQuery();

          cy.get(".Visualization").within(() => {
            cy.findByText(representativeResult);
          });
        });

        it("when set as the default value for a required filter", () => {
          setFilterWidgetType(subType);

          setRequiredFieldFilterDefaultValue(term);

          runQuery();

          cy.get(".Visualization").within(() => {
            cy.findByText(representativeResult);
          });
        });
      });
    },
  );
});
