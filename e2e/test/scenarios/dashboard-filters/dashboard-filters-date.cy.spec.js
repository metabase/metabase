import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitDashboard,
} from "e2e/support/helpers";

import * as DateFilter from "../native-filters/helpers/e2e-date-filter-helpers";
import { DASHBOARD_DATE_FILTERS } from "./shared/dashboard-filters-date";

describe("scenarios > dashboard > filters > date", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata").as("metadata");

    restore();
    cy.signInAsAdmin();

    visitDashboard(1);

    editDashboard();
  });

  it(`should work when set through the filter widget`, () => {
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

        clearFilter(index);
      },
    );
  });

  // Rather than going through every single filter type,
  // make sure the default filter works for just one of the available options
  it(`should work when set as the default filter`, () => {
    setFilter("Time", "Month and Year");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    DateFilter.setMonthAndYear({
      month: "November",
      year: "2016",
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
    cy.findByText("November, 2016").click();
    popover().contains("June").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("33.9");
  });

  it("should show sub-day resolutions in relative date filter (metabase#6660)", () => {
    visitDashboard(1);
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
    cy.icon("ellipsis").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Include this minute").click();
  });

  it("correctly serializes exclude filter on non-English locales (metabase#29122)", () => {
    cy.request("GET", "/api/user/current").then(({ body: { id: USER_ID } }) => {
      cy.request("PUT", `/api/user/${USER_ID}`, { locale: "fr" });
    });

    visitDashboard(1);
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
    cy.findByText("Mettre à jour le filtre").click(); // "Update filter"

    cy.url().should(
      "match",
      /\/dashboard\/1\?filtre_de_date=exclude-months-Jan/,
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
      cy.findByText("Update filter").click();
      break;

    case "Date Range":
      DateFilter.setDateRange(filterValue);
      cy.findByText("Update filter").click();
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

function clearFilter(index) {
  filterWidget().eq(index).find(".Icon-close").click();
  cy.wait("@dashcardQuery1");
}
