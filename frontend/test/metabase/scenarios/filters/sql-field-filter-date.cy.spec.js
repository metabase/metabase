import {
  restore,
  mockSessionProperty,
  openNativeEditor,
  popover,
} from "__support__/e2e/cypress";

import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";

const currentYearString = new Date().getFullYear().toString();

const DATE_FILTER_SUBTYPES = {
  "Month and Year": {
    value: {
      month: "September",
      year: "2017",
    },
    representativeResult: "Durable Steel Toucan",
  },
  "Quarter and Year": {
    value: {
      quarter: "Q2",
      year: "2017",
    },
    representativeResult: "Aerodynamic Linen Coat",
  },
  "Single Date": {
    value: "15",
    representativeResult: "No results!",
  },
  "Date Range": {
    value: {
      startDate: "13",
      endDate: "15",
    },
    representativeResult: "No results!",
  },
  "Relative Date": {
    value: "Past 7 days",
    representativeResult: "No results!",
  },
  "Date Filter": {
    value: {
      timeBucket: "Years",
    },
    representativeResult: "Small Marble Shoes",
  },
};

describe("scenarios > filters > sql filters > field filter > Date", () => {
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
      field: "Created At",
    });
  });

  Object.entries(DATE_FILTER_SUBTYPES).forEach(
    ([subType, { value, representativeResult }]) => {
      describe(`should work for ${subType}`, () => {
        beforeEach(() => {
          FieldFilter.setWidgetType(subType);
        });

        it("when set through the filter widget", () => {
          dateFilterSelector({ filterType: subType, filterValue: value });

          SQLFilter.runQuery();

          cy.get(".Visualization").within(() => {
            cy.findByText(representativeResult);
          });
        });

        it("when set as the default value for a required filter", () => {
          dateFilterSelector({
            filterType: subType,
            filterValue: value,
            isFilterRequired: true,
          });

          SQLFilter.runQuery();

          cy.get(".Visualization").within(() => {
            cy.findByText(representativeResult);
          });
        });
      });
    },
  );
});

function setMonthAndYearFilter({ month, year } = {}) {
  cy.findByText(currentYearString).click();
  cy.findByText(year).click();
  cy.findByText(month).click();
}

function setQuarterAndYearFilter({ quarter, year } = {}) {
  cy.findByText(currentYearString).click();
  cy.findByText(year).click();
  cy.findByText(quarter).click();
}

function setSingleDateFilter(day) {
  cy.findByText(day).click();
}

function setDateRangeFilter({ startDate, endDate } = {}) {
  cy.findByText(startDate).click();
  cy.findByText(endDate).click();
}

function setRelativeDateFilter(term) {
  cy.findByText(term).click();
}

function setDateFilter({ condition, quantity, timeBucket } = {}) {
  if (condition) {
    cy.get(".AdminSelect")
      .contains("Previous")
      .click();
    popover()
      .last()
      .contains(condition)
      .click();
  }

  if (quantity) {
    cy.findByPlaceholderText("30")
      .clear()
      .type(quantity);
  }

  if (timeBucket) {
    cy.get(".AdminSelect")
      .contains("Days")
      .click();
    popover()
      .last()
      .contains(timeBucket)
      .click();
  }

  cy.button("Update filter").click();
}

function openDateFilterPicker(isFilterRequired) {
  isFilterRequired && SQLFilter.toggleRequired();

  const selector = isFilterRequired
    ? cy.findByText("Select a default value…")
    : cy.get("fieldset");

  return selector.click();
}

function dateFilterSelector({
  filterType,
  filterValue,
  isFilterRequired = false,
} = {}) {
  openDateFilterPicker(isFilterRequired);

  switch (filterType) {
    case "Month and Year":
      setMonthAndYearFilter(filterValue);
      break;

    case "Quarter and Year":
      setQuarterAndYearFilter(filterValue);
      break;

    case "Single Date":
      setSingleDateFilter(filterValue);
      break;

    case "Date Range":
      setDateRangeFilter(filterValue);
      break;

    case "Relative Date":
      setRelativeDateFilter(filterValue);
      break;

    case "Date Filter":
      setDateFilter(filterValue);
      break;

    default:
      throw new Error("Wrong filter type!");
  }
}
