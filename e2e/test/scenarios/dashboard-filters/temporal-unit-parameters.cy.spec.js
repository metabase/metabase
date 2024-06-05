import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};

describe("scenarios > dashboard > temporal unit parameters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add a temporal unit parameter and connect it to a card", () => {
    cy.createDashboardWithQuestions({
      questions: [questionDetails],
    }).then(({ dashboard }) => {
      visitDashboard(dashboard.id);
    });

    editDashboard();
    cy.findByTestId("dashboard-header")
      .findByLabelText("Add a Unit of Time widget")
      .click();
    getDashboardCard().findByText("Select…").click();
    popover().findByText("Created At: Month").click();
    saveDashboard();
    getDashboardCard().findByText("Created At: Month").should("be.visible");

    filterWidget().click();
    popover().findByText("Year").click();
    getDashboardCard().findByText("Created At: Year").should("be.visible");
  });
});
