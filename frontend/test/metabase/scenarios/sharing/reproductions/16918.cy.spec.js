import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

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

describe.skip("issue 16918", () => {
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

    cy.findByText("Select a question").click();
    cy.findByText("16918").click();

    cy.wait("@cardPreview").then(xhr => {
      expect(xhr.response.statusCode).not.to.eq(500);
    });

    // Cypress should be able to find question title in the card preview
    cy.findByText("16918");
  });
});
