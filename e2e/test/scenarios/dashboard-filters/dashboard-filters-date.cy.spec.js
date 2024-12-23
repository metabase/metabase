import { H } from "e2e/support";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

import * as DateFilter from "../native-filters/helpers/e2e-date-filter-helpers";

import { DASHBOARD_DATE_FILTERS } from "./shared/dashboard-filters-date";

describe("scenarios > dashboard > filters > date", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata").as("metadata");

    H.restore();
    cy.signInAsAdmin();

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();
  });

  it("should work when set through the filter widget", () => {
    // Add and connect every single available date filter type
    Object.entries(DASHBOARD_DATE_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      H.setFilter("Date picker", filter);

      cy.findByText("Select…").click();
      H.popover().contains("Created At").first().click();
    });

    H.saveDashboard();

    // Go through each of the filters and make sure they work individually
    Object.entries(DASHBOARD_DATE_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        H.filterWidget().eq(index).click();

        dateFilterSelector({
          filterType: filter,
          filterValue: value,
        });

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.findByTestId("dashcard").within(() => {
          cy.findByText(representativeResult);
        });

        H.clearFilterWidget(index);
        cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      },
    );
  });

  // Rather than going through every single filter type,
  // make sure the default filter works for just one of the available options
  it("should work when set as the default filter", () => {
    H.setFilter("Date picker", "Month and Year");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    DateFilter.setMonthAndYear({
      month: "November",
      year: "2022",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    H.popover().contains("Created At").first().click();

    H.saveDashboard();

    // The default value should immediately be applied
    cy.findByTestId("dashcard").within(() => {
      cy.findByText("85.88");
    });

    // Make sure we can override the default value
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("November 2022").click();
    H.popover().contains("June").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("33.9");
  });

  it("should support being required", () => {
    H.setFilter("Date picker", "Month and Year", "Month and Year");

    // Can't save without a default value
    H.toggleRequiredParameter();
    H.dashboardSaveButton().should("be.disabled");
    H.dashboardSaveButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      'The "Month and Year" parameter requires a default value but none was provided.',
    );

    // Can't close sidebar without a default value
    H.dashboardParametersDoneButton().should("be.disabled");
    H.dashboardParametersDoneButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      "The parameter requires a default value but none was provided.",
    );

    H.sidebar().findByText("Default value").next().click();
    DateFilter.setMonthAndYear({
      month: "November",
      year: "2023",
    });

    H.selectDashboardFilter(cy.findByTestId("dashcard"), "Created At");
    H.saveDashboard();

    // Updates the filter value
    H.filterWidget().should("contain.text", "November 2023").click();
    H.popover().findByText("December").click();
    H.filterWidget().findByText("December 2023");
    H.ensureDashboardCardHasText("76.83");

    // Resets the value back by clicking widget icon
    H.resetFilterWidgetToDefault();
    H.filterWidget().findByText("November 2023");
    H.ensureDashboardCardHasText("27.74");
  });

  it("should show sub-day resolutions in relative date filter (metabase#6660)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    H.setFilter("Date picker", "All Options");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No default").click();
    // click on Relative dates…, to open the relative date filter type tabs
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Relative dates…").click();
    // choose Next, under which the new options should be available
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Next").click();
    // click on Days (the default value), which should open the resolution dropdown
    cy.findByDisplayValue("days").click();
    // Hours should appear in the selection box (don't click it)
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("hours");
    // Minutes should appear in the selection box; click it
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("minutes").click();
    // also check the "Include this minute" checkbox
    // which is actually "Include" followed by "this minute" wrapped in <strong>, so has to be clicked this way
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Include this minute").click();
  });

  it("correctly serializes exclude filter on non-English locales (metabase#29122)", () => {
    cy.request("GET", "/api/user/current").then(({ body: { id: USER_ID } }) => {
      cy.request("PUT", `/api/user/${USER_ID}`, { locale: "fr" });
    });

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    // we can't use helpers as they use english words
    cy.icon("pencil").click();
    cy.icon("filter").click();

    H.popover().icon("calendar").click(); // "Time" -> "All Options"

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sélectionner...").click(); // "Select…"
    H.popover().contains("Created At").first().click();

    H.saveDashboard({
      buttonLabel: "Sauvegarder",
      editBarText: "Vous êtes en train d'éditer ce tableau de bord.",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Toutes les options").click(); // "All Options"
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Exclure...").click(); // "Exclude…"
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Mois de l'année...").click(); // "Months of the year…"
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("janvier").click(); // "January"

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Ajouter un filtre").click(); // "Add filter"

    cy.url().should(
      "match",
      /\/dashboard\/\d+\?toutes_les_options=exclude-months-Jan/,
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
