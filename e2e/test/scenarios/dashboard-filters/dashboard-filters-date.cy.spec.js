import {
  ORDERS_DASHBOARD_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  clearFilterWidget,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitDashboard,
  toggleRequiredParameter,
  dashboardSaveButton,
  selectDashboardFilter,
  ensureDashboardCardHasText,
  resetFilterWidgetToDefault,
  sidebar,
  dashboardParametersDoneButton,
} from "e2e/support/helpers";

import * as DateFilter from "../native-filters/helpers/e2e-date-filter-helpers";

import { DASHBOARD_DATE_FILTERS } from "./shared/dashboard-filters-date";

describe("scenarios > dashboard > filters > date", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata").as("metadata");

    restore();
    cy.signInAsAdmin();

    visitDashboard(ORDERS_DASHBOARD_ID);

    editDashboard();
  });

  it("should work when set through the filter widget", () => {
    // Add and connect every single available date filter type
    Object.entries(DASHBOARD_DATE_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      setFilter("Time", filter);

      cy.findByText("Select…").click();
      popover().contains("Created At").first().click();
    });

    saveDashboard();

    // Go through each of the filters and make sure they work individually
    Object.entries(DASHBOARD_DATE_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        filterWidget().eq(index).click();

        dateFilterSelector({
          filterType: filter,
          filterValue: value,
        });

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.get(".Card").within(() => {
          cy.findByText(representativeResult);
        });

        clearFilterWidget(index);
        cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      },
    );
  });

  // Rather than going through every single filter type,
  // make sure the default filter works for just one of the available options
  it("should work when set as the default filter", () => {
    setFilter("Time", "Month and Year");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    DateFilter.setMonthAndYear({
      month: "November",
      year: "2022",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    popover().contains("Created At").first().click();

    saveDashboard();

    // The default value should immediately be applied
    cy.get(".Card").within(() => {
      cy.findByText("85.88");
    });

    // Make sure we can override the default value
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("November 2022").click();
    popover().contains("June").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("33.9");
  });

  it("should support being required", () => {
    setFilter("Time", "Month and Year");

    // Can't save without a default value
    toggleRequiredParameter();
    dashboardSaveButton().should("be.disabled");
    dashboardSaveButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      'The "Month and Year" parameter requires a default value but none was provided.',
    );

    // Can't close sidebar without a default value
    dashboardParametersDoneButton().should("be.disabled");
    dashboardParametersDoneButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      "The parameter requires a default value but none was provided.",
    );

    sidebar().findByText("Default value").next().click();
    DateFilter.setMonthAndYear({
      month: "November",
      year: "2023",
    });

    selectDashboardFilter(cy.findByTestId("dashcard"), "Created At");
    saveDashboard();

    // Updates the filter value
    filterWidget().click();
    popover().findByText("December").click();
    filterWidget().findByText("December 2023");
    ensureDashboardCardHasText("76.83");

    // Resets the value back by clicking widget icon
    resetFilterWidgetToDefault();
    filterWidget().findByText("November 2023");
    ensureDashboardCardHasText("27.74");
  });

  it("should show sub-day resolutions in relative date filter (metabase#6660)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    cy.icon("pencil").click();
    cy.icon("filter").click();

    popover().within(() => {
      cy.findByText("Time").click();
      cy.findByText("All Options").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No default").click();
    // click on Relative dates..., to open the relative date filter type tabs
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Relative dates...").click();
    // choose Next, under which the new options should be available
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Next").click();
    // click on Days (the default value), which should open the resolution dropdown
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("days").click();
    // Hours should appear in the selection box (don't click it)
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("hours");
    // Minutes should appear in the selection box; click it
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("minutes").click();
    // also check the "Include this minute" checkbox
    // which is actually "Include" followed by "this minute" wrapped in <strong>, so has to be clicked this way
    popover().icon("ellipsis").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Include this minute").click();
  });

  it("correctly serializes exclude filter on non-English locales (metabase#29122)", () => {
    cy.request("GET", "/api/user/current").then(({ body: { id: USER_ID } }) => {
      cy.request("PUT", `/api/user/${USER_ID}`, { locale: "fr" });
    });

    visitDashboard(ORDERS_DASHBOARD_ID);
    cy.icon("pencil").click();
    cy.icon("filter").click();

    popover().within(() => {
      cy.findByText("Heure").click(); // "Time"
      cy.findByText("Toutes les options").click(); // "All Options"
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sélectionner...").click(); // "Select…"
    popover().contains("Created At").first().click();

    saveDashboard({
      buttonLabel: "Sauvegarder",
      editBarText: "Vous êtes en train d'éditer ce tableau de bord.",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filtre de date").click(); // "Date Filter"
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Exclure...").click(); // "Exclude..."
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Mois de l'année...").click(); // "Months of the year..."
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("janvier").click(); // "January"

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Ajouter un filtre").click(); // "Add filter"

    cy.url().should(
      "match",
      /\/dashboard\/\d+\?filtre_de_date=exclude-months-Jan/,
    );
  });
});

function dateFilterSelector({ filterType, filterValue } = {}) {
  switch (filterType) {
    case "Month and Year":
      DateFilter.setMonthAndYear(filterValue);
      break;

    case "Quarter and Year":
      DateFilter.setQuarterAndYear(filterValue);
      break;

    case "Single Date":
      DateFilter.setSingleDate(filterValue);
      DateFilter.setTime({ hours: 11, minutes: 0 });
      cy.findByText("Add filter").click();
      break;

    case "Date Range":
      DateFilter.setDateRange(filterValue);
      cy.findByText("Add filter").click();
      break;

    case "Relative Date":
      DateFilter.setRelativeDate(filterValue);
      break;

    case "All Options":
      DateFilter.setAdHocFilter(filterValue);
      break;

    default:
      throw new Error("Wrong filter type!");
  }
}
