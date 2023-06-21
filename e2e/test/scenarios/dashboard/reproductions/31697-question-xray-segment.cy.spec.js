import { popover, restore, visitQuestion } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const segmentDetails = {
  name: "Orders segment",
  description: "All orders with a total under $100.",
  table_id: ORDERS_ID,
  definition: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    filter: ["<", ["field", ORDERS.TOTAL, null], 100],
  },
};

const getQuestionDetails = segment => ({
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    filter: ["segment", segment.id],
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.metrics": ["count"],
    "graph.dimensions": ["CREATED_AT"],
  },
});

describe("issue 31697", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("POST", "/api/segment", segmentDetails).then(
      ({ body: segment }) => {
        cy.createQuestion(getQuestionDetails(segment), { wrapId: true });
      },
    );
    cy.intercept("GET", "/api/automagic-dashboards/**").as("xrayDashboard");
  });

  it("should allow x-rays for questions with segments (metabase#31697)", () => {
    cy.get("@questionId").then(visitQuestion);
    cy.get(".dot").eq(0).click({ force: true });
    popover().findByText("Automatic insights…").click();
    popover().findByText("X-ray").click();
    cy.wait("@xrayDashboard");
    cy.findByRole("main")
      .findByText("A look at the number of Orders")
      .should("be.visible");
  });
});
