const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  applyFilterByType,
  selectDefaultValueFromPopover,
} from "../native/helpers/e2e-field-filter-helpers";

import { DASHBOARD_TEXT_FILTERS } from "./shared/dashboard-filters-text-category";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > text/category", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails: {
        query: { "source-table": ORDERS_ID, limit: 5 },
      },
      cardDetails: {
        size_x: 24,
        size_y: 8,
      },
    }).then(({ body: { id, dashboard_id } }) => {
      cy.wrap(id).as("dashCardId");
      H.visitDashboard(dashboard_id);
      H.editDashboard();
    });
  });

  it("should work when set through the filter widget", () => {
    DASHBOARD_TEXT_FILTERS.forEach(({ operator, single }) => {
      cy.log(`Make sure we can connect ${operator} filter`);
      H.setFilter("Text or Category", operator);
      cy.findAllByRole("radio", { name: "Multiple values" }).should(
        "be.checked",
      );

      if (single) {
        cy.findAllByRole("radio", { name: "A single value" })
          .click()
          .should("be.checked");
      }

      cy.findByText("Select…").click();
      H.popover().contains("Source").click();
    });
    H.saveDashboard();
    waitDashboardCardQuery();

    DASHBOARD_TEXT_FILTERS.forEach(
      (
        { operator, value, representativeResult, single, negativeAssertion },
        index,
      ) => {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.filterWidget().eq(index).click();
        applyFilterByType(operator, value);
        waitDashboardCardQuery();
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.filterWidget()
          .eq(index)
          .contains(single ? value.replace(/"/g, "") : /\d selections/);

        cy.log(`Make sure ${operator} filter returns correct result`);
        cy.findByTestId("dashcard")
          .should("contain", representativeResult)
          .and("not.contain", negativeAssertion);

        H.clearFilterWidget(index);
        waitDashboardCardQuery();
      },
    );

    cy.log(
      "drill to a question with multi-value 'contains' filter applied (metabase#42999)",
    );
    const containsIndex = DASHBOARD_TEXT_FILTERS.findIndex(
      ({ operator, single }) => operator === "Contains" && !single,
    );
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.filterWidget().eq(containsIndex).click();
    applyFilterByType("Contains", "oo,aa");
    waitDashboardCardQuery();

    H.getDashboardCard().findByText("test question").click();

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

  it("should reset filter state when all values are unselected (metabase#25533)", () => {
    const filterType = "Is";
    const filterValue = "Organic";

    cy.log(`Make sure we can connect '${filterType}' filter`);
    H.setFilter("Text or Category", filterType);

    cy.findByTestId("dashcard").findByText("Select…").click();
    H.popover().contains("Source").click();

    H.saveDashboard();
    waitDashboardCardQuery();

    H.filterWidget().click();
    applyFilterByType(filterType, filterValue);
    waitDashboardCardQuery();
    H.filterWidget()
      .should("contain", filterValue)
      .icon("close")
      .should("be.visible");

    H.filterWidget().click();
    cy.log("uncheck all values");

    H.popover().within(() => {
      cy.findByText(filterValue).click();
      cy.button("Update filter").click();
      waitDashboardCardQuery();
    });

    H.filterWidget()
      .should("contain", "Text")
      .and("not.contain", filterValue)
      .within(() => {
        cy.icon("close").should("not.exist");
      });
    cy.location("search").should("eq", "?text=");
  });

  it("should work when set as the default filter which (if cleared) should not be preserved on reload (metabase#13960)", () => {
    H.setFilter("Text or Category", "Is");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    H.popover().contains("Source").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    applyFilterByType("Is", "Organic");

    // We need to add another filter only to reproduce metabase#13960
    H.setFilter("ID");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    H.popover().contains("User ID").click();

    H.saveDashboard();
    waitDashboardCardQuery();

    cy.location("search").should("eq", "?id=&text=Organic");
    cy.findByTestId("dashcard").contains("39.58");

    // This part reproduces metabase#13960
    // Remove default filter (category)
    cy.get('[data-testid="parameter-widget"] .Icon-close').click();
    waitDashboardCardQuery();

    cy.location("search").should("eq", "?id=&text=");

    H.filterWidget().contains("ID").click();
    cy.findByPlaceholderText("Enter an ID").type("4{enter}").blur();
    cy.button("Add filter").click();
    waitDashboardCardQuery();

    cy.location("search").should("eq", "?id=4&text=");

    cy.reload();
    waitDashboardCardQuery();

    cy.location("search").should("eq", "?id=4&text=");
    H.filterWidget().contains("Text");
    H.filterWidget().contains("Arnold Adams");
  });

  it("should support being required", () => {
    H.setFilter("Text or Category", "Is");
    H.selectDashboardFilter(cy.findByTestId("dashcard"), "Source");

    // Can't save without a default value
    H.toggleRequiredParameter();
    H.dashboardSaveButton().should("be.disabled");
    H.dashboardSaveButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      'The "Text" parameter requires a default value but none was provided.',
    );

    // Can't close sidebar without a default value
    H.dashboardParametersDoneButton().should("be.disabled");
    H.dashboardParametersDoneButton().realHover();
    cy.findByRole("tooltip").should(
      "contain.text",
      "The parameter requires a default value but none was provided.",
    );

    // Updates the filter value
    selectDefaultValueFromPopover("Organic", { buttonLabel: "Update filter" });
    H.saveDashboard();
    waitDashboardCardQuery();
    assertOrganicOnly();

    // Resets the value back by clicking widget icon
    H.toggleFilterWidgetValues(["Google", "Twitter"], {
      buttonLabel: "Update filter",
    });
    waitDashboardCardQuery();
    H.ensureDashboardCardHasText("37.65");
    H.resetFilterWidgetToDefault();
    waitDashboardCardQuery();
    H.filterWidget().findByText("Organic");
    assertOrganicOnly();

    // Removing value resets back to default
    H.toggleFilterWidgetValues(["Organic"], {
      buttonLabel: "Set to default",
    });
    H.popover().should("not.exist");
    H.filterWidget().findByText("Organic").should("be.visible");
    assertOrganicOnly();
  });

  it("should use the list value picker for single- and multi-value category filters (metabase#49323)", () => {
    H.setFilter("Text or Category", "Is", "Single title");
    H.selectDashboardFilter(cy.findByTestId("dashcard"), "Title");
    H.sidebar().findByText("A single value").click();

    H.setFilter("Text or Category", "Is", "Multiple titles");
    H.selectDashboardFilter(cy.findByTestId("dashcard"), "Title");
    H.saveDashboard();
    waitDashboardCardQuery();

    [
      {
        name: "Single title",
        listTestId: "single-select-list-field",
        widgetText: "Aerodynamic Bronze Hat",
      },
      {
        name: "Multiple titles",
        listTestId: "list-field",
        widgetText: "2 selections",
      },
    ].forEach(({ name, listTestId, widgetText }, index) => {
      cy.log(name);
      H.filterWidget({ name }).click();
      H.popover().within(() => {
        cy.findByTestId(listTestId).should("be.visible");
        cy.findByText("Aerodynamic Concrete Bench").should("be.visible");
        cy.findByRole("combobox").should("not.exist");
        cy.findByText("Aerodynamic Concrete Bench").click();
        cy.findByText("Aerodynamic Bronze Hat").should("be.visible").click();
        cy.button("Add filter").click();
      });
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.filterWidget().eq(index).findByText(widgetText).should("be.visible");
    });
  });
});

function assertOrganicOnly() {
  cy.findByTestId("dashcard")
    .should("contain", "39.58")
    .and("not.contain", "37.65");
}

function waitDashboardCardQuery() {
  cy.get("@dashCardId").then((id) => {
    cy.wait(`@dashcardQuery${id}`);
  });
}
