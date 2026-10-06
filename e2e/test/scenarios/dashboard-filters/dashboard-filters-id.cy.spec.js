const { H } = cy;
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

import { addWidgetStringFilter } from "../native/helpers/e2e-field-filter-helpers";

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

describe("scenarios > dashboard > filters > ID", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();

    /**
     * Even though we're already intercepting this route in the visitDashboard helper,
     * it is important to alias it differently here, and to then wait for it in tests.
     *
     * The place where the intercept is first set matters.
     * If we set it before the visitDashboard, we'd have to wait for it after the visit,
     * otherwise we'd always be one wait behind in tests.
     */
    cy.intercept("POST", "api/dashboard/*/dashcard/*/card/*/query").as(
      "dashboardData",
    );
  });

  it("should work for the primary key, the foreign key and the implicit join when set through the filter widget", () => {
    ID_FILTERS.forEach((filter) => addIdFilter(filter));

    H.saveDashboard();
    cy.wait("@dashboardData");

    ID_FILTERS.forEach(
      ({ name, value, representativeResult, remappedValue }, index) => {
        cy.log(name);
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.filterWidget().eq(index).click();
        addWidgetStringFilter(value);
        cy.wait("@dashboardData");
        cy.findByTestId("loading-indicator").should("not.exist");

        assertDashcardResult(representativeResult);
        if (remappedValue) {
          H.filterWidget({ name }).should("contain", remappedValue);
        }

        H.clearFilterWidget(index);
        cy.wait("@dashboardData");
      },
    );
  });

  it("should work for the primary key, the foreign key and the implicit join when set as the default filter", () => {
    ID_FILTERS.forEach((filter) => {
      addIdFilter(filter);
      cy.findByText("Default value").next().click();
      addWidgetStringFilter(filter.value);
    });

    H.saveDashboard();
    cy.wait("@dashboardData");
    cy.findByTestId("loading-indicator").should("not.exist");

    ID_FILTERS.forEach(
      ({ name, representativeResult, remappedValue }, index) => {
        cy.log(name);
        const otherIndexes = ID_FILTERS.map((_, i) => i).filter(
          (i) => i !== index,
        );

        otherIndexes.forEach((otherIndex) => {
          H.clearFilterWidget(otherIndex);
          cy.wait("@dashboardData");
        });

        assertDashcardResult(representativeResult);
        if (remappedValue) {
          H.filterWidget({ name }).should("contain", remappedValue);
        }

        otherIndexes.forEach((otherIndex) => {
          H.resetFilterWidgetToDefault(otherIndex);
          cy.wait("@dashboardData");
        });
      },
    );
  });
});

function addIdFilter({ name, selectColumn }) {
  H.setFilter("ID", undefined, name);

  cy.findByText("Select…").click();
  selectColumn();
}

function assertDashcardResult(representativeResult) {
  cy.findByTestId("dashcard")
    .should("contain", representativeResult)
    .and("not.contain", "39.72");
}
