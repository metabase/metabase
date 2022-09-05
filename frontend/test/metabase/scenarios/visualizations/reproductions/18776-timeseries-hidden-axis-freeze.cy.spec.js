import { restore, visitQuestionAdhoc } from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

const questionDetails = {
  dataset_query: {
    type: "native",
    native: {
      query: `
select 101002 as "id", 1 as "rate"
union all select 103017, 2
union all select 210002, 3`,
    },
    database: SAMPLE_DB_ID,
  },
  display: "bar",
  visualization_settings: {
    "graph.dimensions": ["id"],
    "graph.metrics": ["rate"],
    "graph.x_axis.axis_enabled": false,
  },
};

describe("issue 18776", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not freeze when opening a timeseries chart with sparse data and without the X-axis", () => {
    visitQuestionAdhoc(questionDetails);
    cy.findByText("Visualization").should("be.visible");
  });
});
