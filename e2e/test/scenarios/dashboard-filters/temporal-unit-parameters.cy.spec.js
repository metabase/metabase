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

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const singleBreakoutQuestionDetails = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};

const multiBreakoutQuestionDetails = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
      [
        "field",
        PRODUCTS.CREATED_AT,
        { "temporal-unit": "year", "source-field": ORDERS.PRODUCT_ID },
      ],
    ],
  },
};

const noBreakoutQuestionDetails = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    limit: 1,
  },
};

describe("scenarios > dashboard > temporal unit parameters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("mapping targets", () => {
    it("should add a temporal unit parameter and connect it to a card", () => {
      cy.createDashboardWithQuestions({
        questions: [singleBreakoutQuestionDetails],
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

    it("should allow to map to a question with multiple breakouts", () => {
      cy.createDashboardWithQuestions({
        questions: [multiBreakoutQuestionDetails],
      }).then(({ dashboard }) => {
        visitDashboard(dashboard.id);
      });

      editDashboard();
      cy.findByTestId("dashboard-header")
        .findByLabelText("Add a Unit of Time widget")
        .click();
      getDashboardCard().findByText("Select…").click();
      popover().within(() => {
        cy.findByText("Created At: Month").should("be.visible");
        cy.findByText("Created At: Year").should("be.visible").click();
      });
      saveDashboard();
      getDashboardCard().within(() => {
        cy.findByText("Created At: Month").should("be.visible");
        cy.findByText("2022").should("be.visible");
      });

      filterWidget().click();
      popover().findByText("Quarter").click();
      getDashboardCard().within(() => {
        cy.findByText("Created At: Month").should("be.visible");
        cy.findByText("Q2 2022").should("be.visible");
      });
    });

    it("should not allow to map to a question without breakouts", () => {
      cy.createDashboardWithQuestions({
        questions: [noBreakoutQuestionDetails],
      }).then(({ dashboard }) => {
        visitDashboard(dashboard.id);
      });

      editDashboard();
      cy.findByTestId("dashboard-header")
        .findByLabelText("Add a Unit of Time widget")
        .click();
      getDashboardCard().findByText("No valid fields").should("be.visible");
    });
  });
});
