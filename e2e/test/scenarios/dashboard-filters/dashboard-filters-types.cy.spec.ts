const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

import * as DateFilter from "../native/helpers/e2e-date-filter-helpers";
import {
  addWidgetNumberFilter,
  addWidgetStringFilter,
  selectDefaultValueFromPopover,
  selectFilterValueFromList,
} from "../native/helpers/e2e-field-filter-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

// The widget values, the operators, the required-filter UI and the URL state of
// these filters are covered in Jest (DashboardApp.filters.unit.spec.tsx). These
// tests run one filter of each type against the real backend.
describe("scenarios > dashboard > filters > types", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("on the orders dashboard", () => {
    beforeEach(() => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.editDashboard();
    });

    it("date: should apply a required default value after a reload, update it and reset it", () => {
      cy.log(
        "the default value popover is not cut off on resize (metabase#52918)",
      );
      H.setFilter("Date picker", "All Options");
      H.dashboardParameterSidebar().findByText("No default").click();
      H.popover().within(() => {
        cy.findByText("Fixed date range…").click();
        cy.findByText("Between").should("be.visible");
      });
      H.popover().should(([element]) => {
        expect(element.offsetWidth).to.gte(element.scrollWidth);
      });
      H.dashboardParameterSidebar().button("Remove").click();

      H.setFilter("Date picker", "Month and Year", "Month and Year");
      H.toggleRequiredParameter();
      H.sidebar().findByText("Default value").next().click();
      DateFilter.setMonthAndYear({ month: "Nov", year: "2026" });
      H.selectDashboardFilter(cy.findByTestId("dashcard"), "Created At");
      H.saveDashboard();

      cy.reload();
      cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      H.filterWidget().should("contain.text", "November 2026");
      H.getDashboardCard()
        .should("contain", "27.74")
        .and("not.contain", "39.72");

      H.filterWidget().click();
      H.popover().findByText("Dec").click();
      H.filterWidget().findByText("December 2026");
      H.getDashboardCard()
        .should("contain", "76.83")
        .and("not.contain", "27.74");

      H.resetFilterWidgetToDefault();
      H.filterWidget().findByText("November 2026");
      H.getDashboardCard()
        .should("contain", "27.74")
        .and("not.contain", "76.83");
    });

    it("id: should filter by the primary key, the foreign key and the implicit join through the widget", () => {
      const ID_FILTERS = [
        {
          name: "Order ID",
          selectColumn: () => H.popover().contains("ID").first().click(),
          value: "15",
          representativeResult: "114.42",
        },
        {
          name: "User ID",
          selectColumn: () => H.popover().contains("User ID").click(),
          value: "4",
          representativeResult: "47.68",
          remappedValue: "Arnold Adams - 4",
        },
        {
          name: "Product ID",
          // There are three of these, and the order is fixed:
          // "own" column first, then implicit join on People and User alphabetically.
          // We select index 1 to get the Product.ID.
          selectColumn: () =>
            H.popover().within(() => {
              cy.findAllByText("ID").eq(1).click();
            }),
          value: "10",
          representativeResult: "6.75",
        },
      ];

      ID_FILTERS.forEach(({ name, selectColumn }) => {
        H.setFilter("ID", undefined, name);
        cy.findByText("Select…").click();
        selectColumn();
      });
      H.saveDashboard();

      cy.reload();
      cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);

      ID_FILTERS.forEach(
        ({ name, value, representativeResult, remappedValue }, index) => {
          cy.log(name);
          // eslint-disable-next-line metabase/no-unsafe-element-filtering
          H.filterWidget().eq(index).click();
          addWidgetStringFilter(value);
          cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);

          cy.findByTestId("dashcard")
            .should("contain", representativeResult)
            .and("not.contain", "39.72");
          if (remappedValue) {
            H.filterWidget({ name }).should("contain", remappedValue);
          }

          H.clearFilterWidget(index);
          cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
        },
      );
    });

    it("location: should apply a default value after a reload, clear it, and set it back through the widget", () => {
      H.setFilter("Location", "Is");
      H.selectDashboardFilter(cy.findByTestId("dashcard"), "City");
      H.sidebar().findByText("Default value").next().click();
      selectFilterValueFromList("Abbeville");
      H.saveDashboard();

      cy.reload();
      cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      cy.findByTestId("dashcard")
        .should("contain", "1510")
        .and("not.contain", "39.72");

      H.clearFilterWidget(0);
      cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      cy.findByTestId("dashcard").should("contain", "39.72");

      H.filterWidget().click();
      addWidgetStringFilter("Abbeville", { buttonLabel: "Set to default" });
      cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      cy.findByTestId("dashcard")
        .should("contain", "1510")
        .and("not.contain", "39.72");
    });

    it("number: should apply a required default value after a reload, update it and reset it", () => {
      H.setFilter("Number", "Equal to", "Equal to");
      H.selectDashboardFilter(cy.findByTestId("dashcard"), "Tax");
      H.toggleRequiredParameter();
      H.sidebar().findByText("Default value").next().click();
      addWidgetNumberFilter("2.07", { buttonLabel: "Update filter" });
      H.saveDashboard();

      cy.reload();
      cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      H.filterWidget().findByText("2.07");
      assertDefaultTaxApplied();

      H.setFilterWidgetValue("5.27", "Enter a number");
      cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      H.ensureDashboardCardHasText("95.77");

      H.resetFilterWidgetToDefault();
      cy.wait(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
      H.filterWidget().findByText("2.07");
      assertDefaultTaxApplied();
    });
  });

  it("text: should apply a required default value after a reload, update it and reset it", () => {
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

    H.setFilter("Text or Category", "Is");
    H.selectDashboardFilter(cy.findByTestId("dashcard"), "Source");
    H.toggleRequiredParameter();
    selectDefaultValueFromPopover("Organic", { buttonLabel: "Update filter" });
    H.saveDashboard();

    cy.reload();
    waitDashboardCardQuery();
    H.filterWidget().findByText("Organic");
    assertOrganicOnly();

    H.toggleFilterWidgetValues(["Google", "Twitter"], {
      buttonLabel: "Update filter",
    });
    waitDashboardCardQuery();
    H.ensureDashboardCardHasText("37.65");

    H.resetFilterWidgetToDefault();
    waitDashboardCardQuery();
    H.filterWidget().findByText("Organic");
    assertOrganicOnly();
  });
});

function assertDefaultTaxApplied() {
  cy.findByTestId("dashcard")
    .should("contain", "37.65")
    .and("not.contain", "110.93")
    .and("not.contain", "95.77");
}

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
