const { H } = cy;
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import { dayjs } from "metabase/dayjs";

import * as DateFilter from "../native/helpers/e2e-date-filter-helpers";

import { DASHBOARD_DATE_FILTERS } from "./shared/dashboard-filters-date";

describe("scenarios > dashboard > filters > date", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should work when set through the filter widget", () => {
    cy.signInAsNormalUser();
    visitOrdersDashboardInEditMode();

    // Add and connect every single available date filter type
    Object.entries(DASHBOARD_DATE_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      H.setFilter("Date picker", filter);

      cy.findByText("Select…").click();
      H.popover().contains("Created At").first().click();
    });

    H.saveDashboard();
    cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);

    // Go through each of the filters and make sure they work individually
    Object.entries(DASHBOARD_DATE_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.filterWidget().eq(index).click();

        dateFilterSelector({
          filterType: filter,
          filterValue: value,
        });
        cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.findByTestId("dashcard")
          .should("contain", representativeResult)
          .and("not.contain", "39.72");

        H.clearFilterWidget(index);
        cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      },
    );

    const allOptionsWidget = () => H.filterWidget().eq(4);

    cy.log("Round the relative date range preview (metabase#22482)");
    allOptionsWidget().click();
    H.popover().within(() => {
      cy.findByText("Relative date range…").click();
      cy.findByLabelText("Interval").clear().type(15);
      cy.findByRole("textbox", { name: "Unit" }).click();
    });
    H.selectDropdown().findByText("months").click();

    const expectedRange = getFormattedRange(
      dayjs().startOf("month").add(-15, "month"),
      dayjs().add(-1, "month").endOf("month"),
    );
    H.popover().findByText(expectedRange).should("be.visible");
    cy.realPress("Escape");
    H.popover({ skipVisibilityCheck: true }).should("not.exist");

    cy.log("Remove the last excluded hour (metabase#27579)");
    allOptionsWidget().click();
    H.popover().within(() => {
      cy.findByText("Exclude…").click();
      cy.findByText("Hours of the day…").click();
      cy.findByText("Select all").click();
      cy.findByLabelText("12 AM").should("be.checked");

      cy.findByText("Select all").click();
      cy.findByLabelText("12 AM").should("not.be.checked");
    });
    cy.realPress("Escape");
    H.popover({ skipVisibilityCheck: true }).should("not.exist");

    cy.log(
      "Block an exclude filter with all options selected (metabase#24235)",
    );
    allOptionsWidget().click();
    H.popover().within(() => {
      cy.findByText("Exclude…").click();
      cy.findByText("Days of the week…").click();
      cy.findByText("Select all").click();
      cy.findByText("Add filter").click();
    });

    allOptionsWidget().click();
    H.popover().within(() => {
      cy.findByText("Select all").click();
      cy.button("Update filter").should("be.disabled");
    });
  });

  it("should support being required", () => {
    visitOrdersDashboardInEditMode();

    cy.log("show sub-day resolutions in relative date filter (metabase#6660)");
    H.setFilter("Date picker", "All Options");
    H.dashboardParameterSidebar().findByText("No default").click();
    H.popover().within(() => {
      cy.findByText("Relative date range…").click();
      cy.findByText("Next").click();
      cy.findByDisplayValue("days").click();
    });
    H.selectDropdown().within(() => {
      cy.findByText("hours").should("be.visible");
      cy.findByText("minutes").click();
    });
    H.popover()
      .findByLabelText(/Include this minute/)
      .should("not.be.checked")
      .click()
      .should("be.checked");
    H.dashboardParameterSidebar().button("Remove").click();

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
      month: "Nov",
      year: "2026",
    });

    H.selectDashboardFilter(cy.findByTestId("dashcard"), "Created At");
    H.saveDashboard();

    H.ensureDashboardCardHasText("27.74");

    // Updates the filter value
    H.filterWidget().should("contain.text", "November 2026").click();
    H.popover().findByText("Dec").click();
    H.filterWidget().findByText("December 2026");
    H.getDashboardCard().should("contain", "76.83").and("not.contain", "27.74");

    // Resets the value back by clicking widget icon
    H.resetFilterWidgetToDefault();
    H.filterWidget().findByText("November 2026");
    H.getDashboardCard().should("contain", "27.74").and("not.contain", "76.83");
  });

  it("correctly serializes exclude filter on non-English locales (metabase#29122)", () => {
    cy.request("GET", "/api/user/current").then(({ body: { id: USER_ID } }) => {
      cy.request("PUT", `/api/user/${USER_ID}`, { locale: "en_ZZ" });
    });

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.dashboardHeader().within(() => {
      // we can't use helpers as they use english words
      cy.icon("pencil").click();
      cy.icon("filter").click();
    });

    H.popover().icon("calendar").click(); // "Time" -> "All Options"

    H.getDashboardCard().findByText("[zz] Select…").click();
    H.popover().contains("Created At").first().click(); // 'Created At' is a column name, so it's not translated
    H.saveDashboard();

    cy.findByTestId("dashboard-parameters-and-cards")
      .findByText("[zz] Date")
      .click();
    H.popover().findByText("[zz] Exclude…").click();
    H.popover().findByText("[zz] Months of the year…").click();
    H.popover().findByText("January").click(); // Dayjs doesn't have en-ZZ locale, falls back to en
    H.popover().findByText("[zz] Add filter").click();

    cy.url().should("match", /\/dashboard\/\d+\?.*date=exclude-months-Jan/);
  });
});

function getFormattedRange(start, end) {
  return `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`;
}

function visitOrdersDashboardInEditMode() {
  H.visitDashboard(ORDERS_DASHBOARD_ID);
  H.editDashboard();
}

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
      DateFilter.setTime({ hours: 9, minutes: 27 });
      cy.findByText("Add filter").click();
      break;

    case "Date Range":
      DateFilter.setDateRange(filterValue);
      cy.findByText("Add filter").click();
      break;

    case "All Options":
      H.popover().within(() => {
        cy.findByText("Fixed date range…").click();
        cy.findByText("Before").click();
        cy.findByLabelText("Date").clear().type(filterValue).blur();
        cy.button("Add filter").click();
      });
      break;

    default:
      throw new Error("Wrong filter type!");
  }
}
