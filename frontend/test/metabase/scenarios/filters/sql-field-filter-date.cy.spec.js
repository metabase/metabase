import {
  restore,
  mockSessionProperty,
  openNativeEditor,
  popover,
} from "__support__/e2e/cypress";

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
    enterNativeQuery("SELECT * FROM products WHERE {{filter}}");

    openPopoverFromDefaultFilterType();
    setFilterType("Field Filter");

    mapFieldFilterTo({
      table: "Products",
      field: "Created At",
    });
  });

  Object.entries(DATE_FILTER_SUBTYPES).forEach(
    ([subType, { value, representativeResult }]) => {
      describe(`should work for ${subType}`, () => {
        beforeEach(() => {
          setFilterWidgetType(subType);
        });

        it("when set through the filter widget", () => {
          dateFilterSelector({ filterType: subType, filterValue: value });

          runQuery();

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

function mapFieldFilterTo({ table, field } = {}) {
  popover()
    .contains(table)
    .click();
  popover()
    .contains(field)
    .click();
}

/**
 * Set the type for the filter widget.
 *
 * @param {("Text"|"Number"|"Date"|"Field Filter")} type - The allowed strings for the type param.
 *
 * @example
 * setFilterWidgetType("Number");
 */
function setFilterWidgetType(type) {
  cy.findByText("Filter widget type")
    .parent()
    .find(".AdminSelect")
    .click();

  popover()
    .findByText(type)
    .click();
}

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

function toggleRequiredFilter() {
  cy.findByText("Required?")
    .parent()
    .find("a")
    .click();
}

function openDateFilterPicker(isFilterRequired) {
  isFilterRequired && toggleRequiredFilter();

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
  switch (filterType) {
    case "Month and Year":
      openDateFilterPicker(isFilterRequired);
      setMonthAndYearFilter(filterValue);
      break;

    case "Quarter and Year":
      openDateFilterPicker(isFilterRequired);
      setQuarterAndYearFilter(filterValue);
      break;

    case "Single Date":
      openDateFilterPicker(isFilterRequired);
      setSingleDateFilter(filterValue);
      break;

    case "Date Range":
      openDateFilterPicker(isFilterRequired);
      setDateRangeFilter(filterValue);
      break;

    case "Relative Date":
      openDateFilterPicker(isFilterRequired);
      setRelativeDateFilter(filterValue);
      break;

    case "Date Filter":
      openDateFilterPicker(isFilterRequired);
      setDateFilter(filterValue);
      break;

    default:
      throw new Error("Wrong filter type!");
  }
}
