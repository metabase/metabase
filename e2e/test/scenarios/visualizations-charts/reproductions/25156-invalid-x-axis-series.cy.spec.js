import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, echartsContainer, restore } from "e2e/support/helpers";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "25156",
  query: {
    "source-table": REVIEWS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", REVIEWS.CREATED_AT, { "temporal-unit": "year" }],
      ["field", REVIEWS.RATING, null],
    ],
  },
  display: "bar",
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT", "RATING"],
    "graph.metrics": ["count"],
    "graph.x_axis.scale": "linear",
  },
};

describe("issue 25156", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should handle invalid x-axis scale (metabase#25156)", () => {
    createQuestion(questionDetails, { visitQuestion: true });

    echartsContainer()
      .should("contain", "2022")
      .and("contain", "2023")
      .and("contain", "2023")
      .and("contain", "2024")
      .and("contain", "2025");
  });
});
