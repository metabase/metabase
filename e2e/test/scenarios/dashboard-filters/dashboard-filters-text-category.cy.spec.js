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
  selectDashboardFilter,
  toggleRequiredParameter,
  dashboardSaveButton,
  ensureDashboardCardHasText,
  toggleFilterWidgetValues,
  resetFilterWidgetToDefault,
  dashboardParametersDoneButton,
} from "e2e/support/helpers";

import {
  applyFilterByType,
  selectDefaultValueFromPopover,
} from "../native-filters/helpers/e2e-field-filter-helpers";

import { DASHBOARD_TEXT_FILTERS } from "./shared/dashboard-filters-text-category";

describe("scenarios > dashboard > filters > text/category", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitDashboard(ORDERS_DASHBOARD_ID);

    editDashboard();
  });

  it("should work when set through the filter widget", () => {
    Object.entries(DASHBOARD_TEXT_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      setFilter("Text or Category", filter);

      cy.findByText("Select…").click();
      popover().contains("Source").click();
    });

    saveDashboard();

    Object.entries(DASHBOARD_TEXT_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        filterWidget().eq(index).click();
        applyFilterByType(filter, value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });

        clearFilterWidget(index);
        cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      },
    );
  });

  it("should reset filter state when all values are unselected (metabase#25533)", () => {
    const filterType = "Is";
    const filterValue = "Organic";

    cy.log(`Make sure we can connect '${filterType}' filter`);
    setFilter("Text or Category", filterType);

    cy.findByTestId("dashcard").findByText("Select…").click();
    popover().contains("Source").click();

    saveDashboard();
    filterWidget().click();

    applyFilterByType(filterType, filterValue);

    filterWidget().click();
    cy.log("uncheck all values");

    popover().within(() => {
      cy.findByText(filterValue).click();
      cy.button("Update filter").click();
    });

    filterWidget().within(() => {
      cy.icon("close").should("not.exist");
    });
  });

  it("should work when set as the default filter which (if cleared) should not be preserved on reload (metabase#13960)", () => {
    setFilter("Text or Category", "Is");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    popover().contains("Source").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    applyFilterByType("Is", "Organic");

    // We need to add another filter only to reproduce metabase#13960
    setFilter("ID");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    popover().contains("User ID").click();

    saveDashboard();
    cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);

    cy.location("search").should("eq", "?text=Organic&id=");
    cy.get(".Card").within(() => {
      cy.contains("39.58");
    });

    // This part reproduces metabase#13960
    // Remove default filter (category)
    cy.get("fieldset .Icon-close").click();
    cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);

    cy.location("search").should("eq", "?text=&id=");

    filterWidget().contains("ID").click();
    cy.findByPlaceholderText("Enter an ID").type("4{enter}").blur();
    cy.button("Add filter").click();
    cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);

    cy.location("search").should("eq", "?text=&id=4");

    cy.reload();
    cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);

    cy.location("search").should("eq", "?text=&id=4");
    filterWidget().contains("Text");
    filterWidget().contains("Arnold Adams");
  });

  it("should support being required", () => {
    setFilter("Text or Category", "Is");
    selectDashboardFilter(cy.findByTestId("dashcard"), "Source");

    // Can't save without a default value
    toggleRequiredParameter();
    dashboardSaveButton().should("be.disabled");
    dashboardSaveButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      'The "Text" parameter requires a default value but none was provided.',
    );

    // Can't close sidebar without a default value
    dashboardParametersDoneButton().should("be.disabled");
    dashboardParametersDoneButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      "The parameter requires a default value but none was provided.",
    );

    // Updates the filter value
    selectDefaultValueFromPopover("Twitter", { buttonLabel: "Update filter" });
    saveDashboard();
    ensureDashboardCardHasText("37.65");

    // Resets the value back by clicking widget icon
    toggleFilterWidgetValues(["Google", "Organic"], {
      buttonLabel: "Update filter",
    });
    resetFilterWidgetToDefault();
    filterWidget().findByText("Twitter");

    // Removing value resets back to default
    toggleFilterWidgetValues(["Twitter"], {
      buttonLabel: "Set to default",
    });
    filterWidget().findByText("Twitter");
  });
});
