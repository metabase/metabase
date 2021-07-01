import {
  restore,
  mockSessionProperty,
  openNativeEditor,
  popover,
} from "__support__/e2e/cypress";

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

function openPopoverFromSelectedFilterType(filterType) {
  cy.get(".AdminSelect-content")
    .contains(filterType)
    .click();
}

function openPopoverFromDefaultFilterType() {
  openPopoverFromSelectedFilterType("Text");
}

function setFilterType(filterType) {
  popover().within(() => {
    cy.findByText(filterType).click();
  });
}

function runQuery(xhrAlias = "dataset") {
  cy.get(".NativeQueryEditor .Icon-play").click();
  cy.wait("@" + xhrAlias);
  cy.icon("play").should("not.exist");
}

function enterNativeQuery(query) {
  cy.get("@editor").type(query, { parseSpecialCharSequences: false });
}

function toggleRequiredFilter() {
  cy.findByText("Required?")
    .parent()
    .find("a")
    .click();
}

function setRequiredFieldFilterDefaultValue(value) {
  toggleRequiredFilter();

  cy.findByText("Enter a default value...").click();

  if (Array.isArray(value)) {
    setBetweenFilterValue(value);
  } else {
    cy.findByPlaceholderText("Enter a default value...").type(value);
    cy.button("Add filter").click();
  }
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

function setFieldFilterWidgetValue(value) {
  cy.get("fieldset").click();

  if (Array.isArray(value)) {
    setBetweenFilterValue(value);
  } else {
    popover()
      .find("input")
      .type(value);
    cy.button("Add filter").click();
  }
}

function setBetweenFilterValue([low, high] = []) {
  popover().within(() => {
    cy.get("input")
      .first()
      .type(low);
    cy.get("input")
      .last()
      .type(high);
  });
  cy.button("Add filter").click();
}
