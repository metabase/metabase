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

const STRING_FILTER_SUBTYPES = {
  String: {
    term: "Synergistic Granite Chair",
    representativeResult: "Synergistic Granite Chair",
  },
  "String is not": {
    term: "Synergistic Granite Chair",
    representativeResult: "Rustic Paper Wallet",
  },
  "String contains": {
    term: "Bronze",
    representativeResult: "Incredible Bronze Pants",
  },
  "String does not contain": {
    term: "Bronze",
    representativeResult: "Rustic Paper Wallet",
  },
  "String starts with": {
    term: "Rustic",
    representativeResult: "Rustic Paper Wallet",
  },
  "String ends with": {
    term: "Hat",
    representativeResult: "Small Marble Hat",
  },
};

describe("scenarios > filters > sql filters > field filter > String", () => {
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
      field: "Title",
    });
  });

  Object.entries(STRING_FILTER_SUBTYPES).forEach(
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
