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
  // "Date filter": {
  //   value: "Years",
  //   representativeResult: "Small Marble Shoes",
  // },
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
        it("when set through the filter widget", () => {
          setFilterWidgetType(subType);

          switch (subType) {
            case "Month and Year":
              setMonthAndYearFilter(value);
              break;
            case "Quarter and Year":
              setQuarterAndYearFilter(value);
              break;
            case "Single Date":
              setSingleDateFilter(value);
              break;
            case "Date Range":
              setDateRangeFilter(value);
              break;
            case "Relative Date":
              setRelativeDateFilter(value);
              break;
            default:
              throw new Error("Wrong filter!");
          }

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
  cy.get("fieldset").click();
  cy.findByText(currentYearString).click();
  cy.findByText(year).click();
  cy.findByText(month).click();
}

function setQuarterAndYearFilter({ quarter, year } = {}) {
  cy.get("fieldset").click();
  cy.findByText(currentYearString).click();
  cy.findByText(year).click();
  cy.findByText(quarter).click();
}

function setSingleDateFilter(day) {
  cy.get("fieldset").click();
  cy.findByText(day).click();
}

function setDateRangeFilter({ startDate, endDate } = {}) {
  cy.get("fieldset").click();
  cy.findByText(startDate).click();
  cy.findByText(endDate).click();
}

function setRelativeDateFilter(term) {
  cy.get("fieldset").click();
  cy.findByText(term).click();
}
