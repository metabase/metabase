import { restore, popover, visualize } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "17767",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }]],
  },
};

describe("issue 17767", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should be able to do subsequent joins on question with the aggregation that uses implicit joins (metabase#17767)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    cy.icon("notebook").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();

    // Join "Previous results" with
    popover().contains("Reviews").click();

    // On
    popover().contains("ID").click();
    // =
    popover()
      .contains(/Products? ID/)
      .click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("xavier");
  });
});
