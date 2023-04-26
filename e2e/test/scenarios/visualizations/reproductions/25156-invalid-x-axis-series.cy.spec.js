import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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

describe.skip("issue 25156", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should handle invalid x-axis scale (metabase#25156)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    cy.get(".bar").should("have.length.at.least", 20);
    cy.get(".x.axis .tick")
      .should("contain", "2016")
      .and("contain", "2017")
      .and("contain", "2018")
      .and("contain", "2019")
      .and("contain", "2020");
  });
});
