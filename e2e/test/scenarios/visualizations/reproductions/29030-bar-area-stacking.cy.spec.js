import { restore, visitQuestionAdhoc } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS, PEOPLE, PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "29030",
  dataset_query: {
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      ],
    },
    database: SAMPLE_DB_ID,
  },
  display: "bar",
  visualization_settings: {
    "stackable.stack_type": "stacked",
    "stackable.stack_display": "bar",
  },
};

describe("issue 29030", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails);
  });

  it("stacking type should update when transitioning between area and bar charts (29030)", () => {
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("Area-button").click().click();
    cy.findByTestId("sidebar-content").findByText("Display").click();

    cy.findByTestId("sidebar-content").within(() => {
      cy.icon("area").closest("li").should("have.attr", "aria-checked", "true");
    });
  });
});
