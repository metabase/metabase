import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "16918",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month-of-year" }],
      ["field", PRODUCTS.CATEGORY, null],
    ],
  },
  display: "line",
};

describe("issue 16918", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body }) => {
      cy.intercept("GET", `/api/pulse/preview_card_info/${body.id}`).as(
        "cardPreview",
      );
    });
  });

  it(`should load question binned by "Month of Year" or similar granularity (metabase#16918)`, () => {
    cy.visit("/pulse/create");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a question").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("16918").click();

    cy.wait("@cardPreview").then(xhr => {
      expect(xhr.response.statusCode).not.to.eq(500);
    });

    // Cypress should be able to find question title in the card preview
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("16918");
  });
});
