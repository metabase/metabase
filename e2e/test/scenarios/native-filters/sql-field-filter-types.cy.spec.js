const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

import * as DateFilter from "./helpers/e2e-date-filter-helpers";
import {
  DATE_FILTER_SUBTYPES,
  NUMBER_FILTER_SUBTYPES,
  STRING_FILTER_SUBTYPES,
} from "./helpers/e2e-field-filter-data-objects";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

const dateFilters = Object.entries(DATE_FILTER_SUBTYPES);

describe("scenarios > filters > sql filters > field filter > Date", () => {
  function openDateFilterPicker(isFilterRequired) {
    const selector = isFilterRequired
      ? cy.findByText("Select a default value…")
      : H.filterWidget();

    return selector.click();
  }

  function dateFilterSelector({
    filterType,
    filterValue,
    isFilterRequired = false,
    buttonLabel = "Add filter",
  } = {}) {
    openDateFilterPicker(isFilterRequired);

    switch (filterType) {
      case "Month and Year":
        DateFilter.setMonthAndYear(filterValue);
        break;

      case "Quarter and Year":
        DateFilter.setQuarterAndYear(filterValue);
        break;

      case "Single Date":
        DateFilter.setSingleDate(filterValue);
        cy.findByText(buttonLabel).click();
        break;

      case "Date Range":
        DateFilter.setDateRange(filterValue);
        cy.findByText(buttonLabel).click();
        break;

      case "Relative Date":
        DateFilter.setRelativeDate(filterValue);
        break;

      case "All Options":
        DateFilter.setAdHocFilter(filterValue, buttonLabel);
        break;

      default:
        throw new Error("Wrong filter type!");
    }
  }

  beforeEach(() => {
    H.restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();

    H.startNewNativeQuestion();

    SQLFilter.enterParameterizedQuery("SELECT * FROM products WHERE {{f}}");

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "Products",
      field: "Created At",
    });
  });

  it("when set through the filter widget", () => {
    dateFilters.forEach(([subType, { value, representativeResult }]) => {
      cy.log(`Make sure it works for ${subType.toUpperCase()}`);

      FieldFilter.setWidgetType(subType);
      dateFilterSelector({
        filterType: subType,
        filterValue: value,
      });

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        // Scroll to ensure target element is rendered due to table virtualization
        H.tableInteractiveScrollContainer().scrollTo(0, 300);
        cy.findByText(representativeResult);
      });
    });
  });

  it("when set as the default value for a required filter", () => {
    SQLFilter.toggleRequired();

    dateFilters.forEach(([subType, { value, representativeResult }], index) => {
      cy.log(`Make sure it works for ${subType.toUpperCase()}`);

      FieldFilter.setWidgetType(subType);

      dateFilterSelector({
        filterType: subType,
        filterValue: value,
        isFilterRequired: true,
        buttonLabel: "Add filter",
      });

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        // Scroll to ensure target element is rendered due to table virtualization
        H.tableInteractiveScrollContainer().scrollTo(0, 300);
        cy.findByText(representativeResult);
      });
    });
  });
});

describe("scenarios > filters > sql filters > field filter > Number", () => {
  const numericFilters = Object.entries(NUMBER_FILTER_SUBTYPES);

  beforeEach(() => {
    H.restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();

    H.startNewNativeQuestion();
    SQLFilter.enterParameterizedQuery("SELECT * FROM products WHERE {{f}}");

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "Products",
      field: "Rating",
    });
  });

  it("when set through the filter widget", () => {
    numericFilters.forEach(([subType, { value, representativeResult }]) => {
      cy.log(`Make sure it works for ${subType.toUpperCase()}`);

      FieldFilter.setWidgetType(subType);

      FieldFilter.openEntryForm();
      FieldFilter.addWidgetNumberFilter(value);

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText(representativeResult);
      });
    });
  });

  it("when set as the default value for a required filter", () => {
    SQLFilter.toggleRequired();

    numericFilters.forEach(
      ([subType, { value, representativeResult }], index) => {
        cy.log(`Make sure it works for ${subType.toUpperCase()}`);

        FieldFilter.setWidgetType(subType);

        FieldFilter.addDefaultNumberFilter(value, "Update filter");

        SQLFilter.runQuery();

        cy.findByTestId("query-visualization-root").within(() => {
          cy.findByText(representativeResult);
        });
      },
    );
  });
});

describe("scenarios > filters > sql filters > field filter > String", () => {
  const stringFilters = Object.entries(STRING_FILTER_SUBTYPES);

  beforeEach(() => {
    H.restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();

    H.startNewNativeQuestion({ display: "table" });
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

        cy.findByTestId("query-visualization-root").within(() => {
          cy.findByText(representativeResult);
          cy.findByText("Toucan").should("not.exist");
        });
      },
    );
  });

  it("when set as the default value for a required filter", () => {
    // Use a bigger viewport to avoid elements being obscured by falling out of the screen.
    cy.viewport(1280, 1400);

    SQLFilter.toggleRequired();

    stringFilters.forEach(
      ([subType, { searchTerm, value, representativeResult }], index) => {
        FieldFilter.setWidgetType(subType);

        if (searchTerm) {
          FieldFilter.pickDefaultValue(searchTerm, value, "Update filter");
        } else {
          FieldFilter.addDefaultStringFilter(value);
        }

        SQLFilter.runQuery();

        cy.findByTestId("query-visualization-root").within(() => {
          cy.findByText(representativeResult);
          cy.findByText("Toucan").should("not.exist");
        });
      },
    );
  });
});

describe(
  "scenarios > filters > sql filters > field filter > Boolean",
  { tags: "@external" },
  () => {
    const dialect = "postgres";
    const tableName = "many_data_types";

    function assertScalarValue(value) {
      cy.findByTestId("scalar-value").findByText(value).should("be.visible");
    }

    beforeEach(() => {
      H.restore(`${dialect}-writable`);
      H.resetTestTable({ type: dialect, table: tableName });
      cy.signInAsAdmin();
      H.resyncDatabase({ tableName });
    });

    it("should be able to use boolean field filters", () => {
      cy.log("setup a boolean field filter");
      H.startNewNativeQuestion({ database: WRITABLE_DB_ID });
      SQLFilter.enterParameterizedQuery(
        `SELECT count(*) FROM ${tableName} WHERE {{f}}`,
      );
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({
        table: "Many Data Types",
        field: "Boolean",
      });
      H.saveQuestion("SQL", undefined, {
        path: ["Our analytics"],
      });

      cy.log("field filter with true");
      H.runNativeQuery({ wait: false });
      assertScalarValue("2");
      H.filterWidget().click();
      H.popover().button("Add filter").click();
      H.runNativeQuery({ wait: false });
      assertScalarValue("1");
      H.filterWidget().icon("close").click();
      H.runNativeQuery({ wait: false });
      assertScalarValue("2");

      cy.log("field filter with false");
      H.filterWidget().click();
      H.popover().within(() => {
        cy.findByText("False").click();
        cy.button("Add filter").click();
      });
      H.runNativeQuery({ wait: false });
      assertScalarValue("1");
      H.filterWidget().icon("close").click();
      H.runNativeQuery({ wait: false });
      assertScalarValue("2");
    });
  },
);

describe("scenarios > filters > sql filters > variable > Boolean", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to define boolean variables in the query", () => {
    cy.log("new query");
    H.startNewNativeQuestion();
    SQLFilter.enterParameterizedQuery(
      "select id from products [[where category = (case when {{boolean}} then 'Gadget' else 'Widget' end)]]",
    );
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Boolean");

    cy.log("assert that it works for an ad-hoc query");
    H.filterWidget().click();
    H.popover().button("Add filter").click();
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(53);

    cy.log("assert that it works for a saved query");
    H.saveQuestion("SQL");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByLabelText("False").click();
      cy.button("Update filter").click();
    });
    H.runNativeQuery({ wait: false });
    H.assertQueryBuilderRowCount(54);
  });
});
