import {
  editDashboard,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const question1Details = {
  name: "Q1",
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.metrics": ["count"],
    "graph.dimensions": ["CREATED_AT"],
  },
};

const question2Details = {
  name: "Q2",
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.metrics": ["avg"],
    "graph.dimensions": ["CREATED_AT"],
  },
};

const parameterDetails = {
  name: "Date Filter",
  slug: "date_filter",
  id: "888188ad",
  type: "date/all-options",
  sectionId: "date",
};

const dashboardDetails = {
  name: "25248",
  parameters: [parameterDetails],
};

describe("issue 25248", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow mapping parameters to combined cards individually (metabase#25248)", () => {
    createDashboard();
    editDashboard();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(parameterDetails.name).click();
    cy.findAllByText("Select…").first().click();
    popover().findAllByText("Created At").first().click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Order.Created At").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").should("be.visible");
  });
});

const createDashboard = () => {
  cy.createQuestionAndDashboard({
    questionDetails: question1Details,
    dashboardDetails,
  }).then(({ body: { id, card_id, dashboard_id } }) => {
    cy.createQuestion(question2Details).then(({ body: { id: card_2_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
        cards: [
          {
            id,
            card_id,
            series: [{ id: card_2_id }],
            row: 0,
            col: 0,
            size_x: 12,
            size_y: 8,
          },
        ],
      });
    });
    visitDashboard(dashboard_id);
  });
};
