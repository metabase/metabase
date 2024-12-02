import { openNativeEditor, restore } from "e2e/support/helpers";

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
      : cy.get("fieldset");

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
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();

    openNativeEditor();

    const LEFT_BRACKET = "{{}";
    const DOUBLE_LEFT_BRACKET = `${LEFT_BRACKET}${LEFT_BRACKET}`;
    SQLFilter.enterParameterizedQuery(
      `SELECT * FROM products WHERE ${DOUBLE_LEFT_BRACKET}f}}`,
    );

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

      // When the filter is "Previous N months", ensure that N is large enough
      // that the representative result appears. For this filter, the
      // representative result is Synergistic Steel Chair, created on May 24,
      // 2022.
      if (subType === "All Options" && value.timeBucket === "month") {
        cy.findAllByTestId("parameter-value-widget-target")
          .filter(':contains("Previous 30")')
          .click();
        const representativeResultDate = new Date(2022, 5, 24);
        const monthsAgo = Math.floor(
          (new Date() - representativeResultDate) / (1000 * 60 * 60 * 24 * 30),
        );
        cy.findByTestId("relative-datetime-value")
          .clear()
          .type(`${monthsAgo + 2}`)
          .blur();
        cy.button("Update filter").click();
      }

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
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
        buttonLabel: "Update filter",
      });

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText(representativeResult);
      });
    });
  });
});

describe("scenarios > filters > sql filters > field filter > Number", () => {
  const numericFilters = Object.entries(NUMBER_FILTER_SUBTYPES);

  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();

    openNativeEditor();
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
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();

    openNativeEditor();
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

        searchTerm
          ? FieldFilter.pickDefaultValue(searchTerm, value, "Update filter")
          : FieldFilter.addDefaultStringFilter(value);

        SQLFilter.runQuery();

        cy.findByTestId("query-visualization-root").within(() => {
          cy.findByText(representativeResult);
          cy.findByText("Toucan").should("not.exist");
        });
      },
    );
  });
});
