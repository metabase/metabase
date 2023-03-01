import { restore, visitQuestionAdhoc } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const questionDetails = {
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "native",
    native: {
      query: "select 'a', 'b'",
      "template-tags": {},
    },
  },
  visualization_settings: {
    "table.pivot": true,
    "table.pivot_column": "'a'",
    "table.cell_column": "1",
  },
};

describe("issue 18976", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display a pivot table as regular one when pivot columns are missing (metabase#18976)", () => {
    visitQuestionAdhoc(questionDetails);

    cy.findByText("Showing 1 row");
  });
});
