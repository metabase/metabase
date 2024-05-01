import { restore, openNativeEditor } from "e2e/support/helpers";

import * as DateFilter from "./helpers/e2e-date-filter-helpers";
import { DATE_FILTER_SUBTYPES } from "./helpers/e2e-field-filter-data-objects";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

const dateFilters = Object.entries(DATE_FILTER_SUBTYPES);

describe("scenarios > filters > sql filters > field filter > Date", () => {
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
      });

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText(representativeResult);
      });
    });
  });
});

function openDateFilterPicker(isFilterRequired) {
  const selector = isFilterRequired
    ? cy.findByPlaceholderText("Select a default value…")
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
      DateFilter.setMonthAndYear(filterValue);
      break;

    case "Quarter and Year":
      DateFilter.setQuarterAndYear(filterValue);
      break;

    case "Single Date":
      DateFilter.setSingleDate(filterValue);
      cy.findByText("Add filter").click();
      break;

    case "Date Range":
      DateFilter.setDateRange(filterValue);
      cy.findByText("Add filter").click();
      break;

    case "Relative Date":
      DateFilter.setRelativeDate(filterValue);
      break;

    case "Date Filter":
      DateFilter.setAdHocFilter(filterValue);
      break;

    default:
      throw new Error("Wrong filter type!");
  }
}
