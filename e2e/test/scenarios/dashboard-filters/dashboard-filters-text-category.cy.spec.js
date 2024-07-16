import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
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
  getDashboardCard,
} from "e2e/support/helpers";

import {
  applyFilterByType,
  selectDefaultValueFromPopover,
} from "../native-filters/helpers/e2e-field-filter-helpers";

import { DASHBOARD_TEXT_FILTERS } from "./shared/dashboard-filters-text-category";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > text/category", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({
      questionDetails: {
        query: { "source-table": ORDERS_ID, limit: 5 },
      },
      cardDetails: {
        size_x: 24,
        size_y: 8,
      },
    }).then(({ body: { id, dashboard_id } }) => {
      cy.wrap(id).as("dashCardId");
      visitDashboard(dashboard_id);
      editDashboard();
    });
  });

  it("should drill to a question with multi-value 'contains' filter applied (metabase#42999)", () => {
    setFilter("Text or Category", "Contains");
    cy.findAllByRole("radio", { name: "Multiple values" }).should("be.checked");
    cy.findByTestId("visualization-root").findByText("Select…").click();
    popover().contains("Source").click();
    saveDashboard();
    waitDashboardCardQuery();

    filterWidget().eq(0).click();
    applyFilterByType("Contains", "oo,aa");
    waitDashboardCardQuery();

    getDashboardCard().findByText("test question").click();

    cy.location("href").should("contain", "/question#");
    cy.findByTestId("filter-pill").should(
      "contain.text",
      "User → Source contains 2 selections",
    );
    cy.findByTestId("app-bar").should(
      "contain.text",
      "Started from test question",
    );
  });

  it("should work when set through the filter widget", () => {
    DASHBOARD_TEXT_FILTERS.forEach(({ operator, single }) => {
      cy.log(`Make sure we can connect ${operator} filter`);
      setFilter("Text or Category", operator);
      cy.findAllByRole("radio", { name: "Multiple values" }).should(
        "be.checked",
      );

      if (single) {
        cy.findAllByRole("radio", { name: "A single value" })
          .click()
          .should("be.checked");
      }

      cy.findByText("Select…").click();
      popover().contains("Source").click();
    });
    saveDashboard();
    waitDashboardCardQuery();

    DASHBOARD_TEXT_FILTERS.forEach(
      (
        { operator, value, representativeResult, single, negativeAssertion },
        index,
      ) => {
        filterWidget().eq(index).click();
        applyFilterByType(operator, value);
        waitDashboardCardQuery();
        filterWidget()
          .eq(index)
          .contains(single ? value : /\d selections/);

        cy.log(`Make sure ${operator} filter returns correct result`);
        cy.findByTestId("dashcard")
          .should("contain", representativeResult)
          .and("not.contain", negativeAssertion);

        clearFilterWidget(index);
        waitDashboardCardQuery();
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
    waitDashboardCardQuery();

    filterWidget().click();
    applyFilterByType(filterType, filterValue);
    waitDashboardCardQuery();

    filterWidget().click();
    cy.log("uncheck all values");

    popover().within(() => {
      cy.findByText(filterValue).click();
      cy.button("Update filter").click();
      waitDashboardCardQuery();
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
    waitDashboardCardQuery();

    cy.location("search").should("eq", "?text=Organic&id=");
    cy.findByTestId("dashcard").contains("39.58");

    // This part reproduces metabase#13960
    // Remove default filter (category)
    cy.get("fieldset .Icon-close").click();
    waitDashboardCardQuery();

    cy.location("search").should("eq", "?text=&id=");

    filterWidget().contains("ID").click();
    cy.findByPlaceholderText("Enter an ID").type("4{enter}").blur();
    cy.button("Add filter").click();
    waitDashboardCardQuery();

    cy.location("search").should("eq", "?text=&id=4");

    cy.reload();
    waitDashboardCardQuery();

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
    waitDashboardCardQuery();
    ensureDashboardCardHasText("37.65");

    // Resets the value back by clicking widget icon
    toggleFilterWidgetValues(["Google", "Organic"], {
      buttonLabel: "Update filter",
    });
    waitDashboardCardQuery();
    resetFilterWidgetToDefault();
    waitDashboardCardQuery();
    filterWidget().findByText("Twitter");

    // Removing value resets back to default
    toggleFilterWidgetValues(["Twitter"], {
      buttonLabel: "Set to default",
    });
    filterWidget().findByText("Twitter");
  });
});

function waitDashboardCardQuery() {
  cy.get("@dashCardId").then(id => {
    cy.wait(`@dashcardQuery${id}`);
  });
}
