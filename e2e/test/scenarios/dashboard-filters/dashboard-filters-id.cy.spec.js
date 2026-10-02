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

const [PRIMARY_KEY, FOREIGN_KEY, IMPLICIT_JOIN] = ID_FILTERS;

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
          H.checkFilterLabelAndValue(name, remappedValue);
        }

        H.clearFilterWidget(index);
        cy.wait("@dashboardData");
      },
    );
  });

  it("should work for the primary key when set as the default filter", () => {
    addIdFilter(PRIMARY_KEY);
    setDefaultValueAndSave(PRIMARY_KEY.value);

    assertDashcardResult(PRIMARY_KEY.representativeResult);
  });

  it("should work for the foreign key when set as the default filter", () => {
    addIdFilter(FOREIGN_KEY);
    setDefaultValueAndSave(FOREIGN_KEY.value);

    assertDashcardResult(FOREIGN_KEY.representativeResult);
    H.checkFilterLabelAndValue(FOREIGN_KEY.name, FOREIGN_KEY.remappedValue);
  });

  it("should work on the implicit join when set as the default filter", () => {
    addIdFilter(IMPLICIT_JOIN);
    setDefaultValueAndSave(IMPLICIT_JOIN.value);

    assertDashcardResult(IMPLICIT_JOIN.representativeResult);
  });
});

function addIdFilter({ name, selectColumn }) {
  H.setFilter("ID", undefined, name);

  cy.findByText("Select…").click();
  selectColumn();
}

function setDefaultValueAndSave(value) {
  cy.findByText("Default value").next().click();
  addWidgetStringFilter(value);

  H.saveDashboard();
  cy.wait("@dashboardData");
  cy.findByTestId("loading-indicator").should("not.exist");
}

function assertDashcardResult(representativeResult) {
  cy.findByTestId("dashcard")
    .should("contain", representativeResult)
    .and("not.contain", "39.72");
}
