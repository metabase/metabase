import {
  restore,
  popover,
  mockSessionProperty,
  openNativeEditor,
} from "__support__/e2e/cypress";

import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

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
    SQLFilter.enterParameterizedQuery(
      "SELECT * FROM products WHERE {{filter}}",
    );

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

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

          SQLFilter.runQuery();

          cy.get(".Visualization").within(() => {
            cy.findByText(representativeResult);
          });
        });

        it("when set as the default value for a required filter", () => {
          setFilterWidgetType(subType);

          SQLFilter.toggleRequired();
          setRequiredFieldFilterDefaultValue(term);

          SQLFilter.runQuery();

          cy.get(".Visualization").within(() => {
            cy.findByText(representativeResult);
          });
        });
      });
    },
  );
});

function setRequiredFieldFilterDefaultValue(value) {
  cy.findByText("Enter a default value...").click();
  cy.findByPlaceholderText("Enter a default value...").type(value);
  cy.button("Add filter").click();
}

function mapFieldFilterTo({ table, field } = {}) {
  popover()
    .contains(table)
    .click();
  popover()
    .contains(field)
    .click();
}

function setFilterWidgetType(type) {
  cy.findByText("Filter widget type")
    .parent()
    .find(".AdminSelect")
    .click();
  popover()
    .findByText(type)
    .click();
}

function setFieldFilterWidgetValue(string) {
  cy.get("fieldset").click();
  popover()
    .find("input")
    .type(string);
  cy.button("Add filter").click();
}
