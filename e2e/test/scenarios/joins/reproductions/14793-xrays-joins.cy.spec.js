import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  dashboardGrid,
  getDashboardCards,
  restore,
  visitQuestionAdhoc,
  popover,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const XRAY_DATASETS = 11; // enough to load most questions

const QUESTION_DETAILS = {
  dataset_query: {
    type: "query",
    query: {
      "source-table": REVIEWS_ID,
      joins: [
        {
          fields: "all",
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field", REVIEWS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
      aggregation: [
        ["sum", ["field", PRODUCTS.PRICE, { "join-alias": "Products" }]],
      ],
      breakout: [["field", REVIEWS.CREATED_AT, { "temporal-unit": "year" }]],
    },
    database: SAMPLE_DB_ID,
  },
  display: "line",
};

describe("issue 14793", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/automagic-dashboards/adhoc/**").as("xray");
    cy.intercept("POST", "/api/dataset").as("postDataset");
  });

  it("x-rays should work on explicit joins when metric is for the joined table (metabase#14793)", () => {
    visitQuestionAdhoc(QUESTION_DETAILS);

    cy.get(".dot").eq(2).click({ force: true });

    popover().findByText("Automatic insights…").click();
    popover().findByText("X-ray").click();

    cy.wait("@xray").then(xhr => {
      for (let i = 0; i < XRAY_DATASETS; ++i) {
        cy.wait("@postDataset");
      }
      expect(xhr.status).not.to.eq(500);
      expect(xhr.response.body.cause).not.to.exist;
    });

    dashboardGrid()
      .findByText("How this metric is distributed across different numbers")
      .should("exist");

    cy.findByTestId("automatic-dashboard-header")
      .findByText(/^A closer look at/)
      .should("be.visible");

    getDashboardCards().should("have.length", 18);
  });
});
