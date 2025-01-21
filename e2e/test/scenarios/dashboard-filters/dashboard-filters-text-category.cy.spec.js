import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  applyFilterByType,
  selectDefaultValueFromPopover,
} from "../native-filters/helpers/e2e-field-filter-helpers";

import { DASHBOARD_TEXT_FILTERS } from "./shared/dashboard-filters-text-category";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > text/category", () => {
  beforeEach(() => {
    cy.restore();
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
      cy.visitDashboard(dashboard_id);
      cy.editDashboard();
    });
  });

  it("should drill to a question with multi-value 'contains' filter applied (metabase#42999)", () => {
    cy.setFilter("Text or Category", "Contains");
    cy.findAllByRole("radio", { name: "Multiple values" }).should("be.checked");
    cy.findByTestId("visualization-root").findByText("Select…").click();
    cy.popover().contains("Source").click();
    cy.saveDashboard();
    waitDashboardCardQuery();

    cy.filterWidget().eq(0).click();
    applyFilterByType("Contains", "oo,aa");
    waitDashboardCardQuery();

    cy.getDashboardCard().findByText("test question").click();

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
      cy.setFilter("Text or Category", operator);
      cy.findAllByRole("radio", { name: "Multiple values" }).should(
        "be.checked",
      );

      if (single) {
        cy.findAllByRole("radio", { name: "A single value" })
          .click()
          .should("be.checked");
      }

      cy.findByText("Select…").click();
      cy.popover().contains("Source").click();
    });
    cy.saveDashboard();
    waitDashboardCardQuery();

    DASHBOARD_TEXT_FILTERS.forEach(
      (
        { operator, value, representativeResult, single, negativeAssertion },
        index,
      ) => {
        cy.filterWidget().eq(index).click();
        applyFilterByType(operator, value);
        waitDashboardCardQuery();
        cy.filterWidget()
          .eq(index)
          .contains(single ? value.replace(/"/g, "") : /\d selections/);

        cy.log(`Make sure ${operator} filter returns correct result`);
        cy.findByTestId("dashcard")
          .should("contain", representativeResult)
          .and("not.contain", negativeAssertion);

        cy.clearFilterWidget(index);
        waitDashboardCardQuery();
      },
    );
  });

  it("should reset filter state when all values are unselected (metabase#25533)", () => {
    const filterType = "Is";
    const filterValue = "Organic";

    cy.log(`Make sure we can connect '${filterType}' filter`);
    cy.setFilter("Text or Category", filterType);

    cy.findByTestId("dashcard").findByText("Select…").click();
    cy.popover().contains("Source").click();

    cy.saveDashboard();
    waitDashboardCardQuery();

    cy.filterWidget().click();
    applyFilterByType(filterType, filterValue);
    waitDashboardCardQuery();

    cy.filterWidget().click();
    cy.log("uncheck all values");

    cy.popover().within(() => {
      cy.findByText(filterValue).click();
      cy.button("Update filter").click();
      waitDashboardCardQuery();
    });

    cy.filterWidget().within(() => {
      cy.icon("close").should("not.exist");
    });
  });

  it("should work when set as the default filter which (if cleared) should not be preserved on reload (metabase#13960)", () => {
    cy.setFilter("Text or Category", "Is");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    cy.popover().contains("Source").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    applyFilterByType("Is", "Organic");

    // We need to add another filter only to reproduce metabase#13960
    cy.setFilter("ID");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    cy.popover().contains("User ID").click();

    cy.saveDashboard();
    waitDashboardCardQuery();

    cy.location("search").should("eq", "?id=&text=Organic");
    cy.findByTestId("dashcard").contains("39.58");

    // This part reproduces metabase#13960
    // Remove default filter (category)
    cy.get("fieldset .Icon-close").click();
    waitDashboardCardQuery();

    cy.location("search").should("eq", "?id=&text=");

    cy.filterWidget().contains("ID").click();
    cy.findByPlaceholderText("Enter an ID").type("4{enter}").blur();
    cy.button("Add filter").click();
    waitDashboardCardQuery();

    cy.location("search").should("eq", "?id=4&text=");

    cy.reload();
    waitDashboardCardQuery();

    cy.location("search").should("eq", "?id=4&text=");
    cy.filterWidget().contains("Text");
    cy.filterWidget().contains("Arnold Adams");
  });

  it("should support being required", () => {
    cy.setFilter("Text or Category", "Is");
    cy.selectDashboardFilter(cy.findByTestId("dashcard"), "Source");

    // Can't save without a default value
    cy.toggleRequiredParameter();
    cy.dashboardSaveButton().should("be.disabled");
    cy.dashboardSaveButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      'The "Text" parameter requires a default value but none was provided.',
    );

    // Can't close sidebar without a default value
    cy.dashboardParametersDoneButton().should("be.disabled");
    cy.dashboardParametersDoneButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      "The parameter requires a default value but none was provided.",
    );

    // Updates the filter value
    selectDefaultValueFromPopover("Twitter", { buttonLabel: "Update filter" });
    cy.saveDashboard();
    waitDashboardCardQuery();
    cy.ensureDashboardCardHasText("37.65");

    // Resets the value back by clicking widget icon
    cy.toggleFilterWidgetValues(["Google", "Organic"], {
      buttonLabel: "Update filter",
    });
    waitDashboardCardQuery();
    cy.resetFilterWidgetToDefault();
    waitDashboardCardQuery();
    cy.filterWidget().findByText("Twitter");

    // Removing value resets back to default
    cy.toggleFilterWidgetValues(["Twitter"], {
      buttonLabel: "Set to default",
    });
    cy.filterWidget().findByText("Twitter").should("be.visible");
  });

  it("should use the list value picker for single-value category filters (metabase#49323)", () => {
    cy.setFilter("Text or Category", "Is");

    cy.selectDashboardFilter(cy.findByTestId("dashcard"), "Title");

    cy.sidebar().findByText("A single value").click();
    cy.saveDashboard();

    waitDashboardCardQuery();

    cy.filterWidget().contains("Text").click();
    cy.popover().within(() => {
      cy.findByRole("combobox").should("not.exist");
      cy.findByText("Aerodynamic Concrete Bench").should("be.visible").click();
      cy.findByText("Aerodynamic Bronze Hat").should("be.visible").click();
      cy.button("Add filter").click();
    });
    cy.filterWidget().findByText("Aerodynamic Bronze Hat").should("be.visible");
  });

  it("should use the list value picker for multi-value category filters (metabase#49323)", () => {
    cy.setFilter("Text or Category", "Is");

    cy.selectDashboardFilter(cy.findByTestId("dashcard"), "Title");

    cy.sidebar().findByText("Multiple values").click();
    cy.saveDashboard();

    waitDashboardCardQuery();

    cy.filterWidget().contains("Text").click();
    cy.popover().within(() => {
      cy.findByRole("combobox").should("not.exist");
      cy.findByText("Aerodynamic Concrete Bench").should("be.visible").click();
      cy.findByText("Aerodynamic Bronze Hat").should("be.visible").click();
      cy.button("Add filter").click();
    });
    cy.filterWidget().findByText("2 selections").should("be.visible");
  });
});

function waitDashboardCardQuery() {
  cy.get("@dashCardId").then(id => {
    cy.wait(`@dashcardQuery${id}`);
  });
}
