import { restore, visitQuestionAdhoc, summarize } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const questionDetails = {
  dataset_query: {
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          fields: "all",
          "source-table": PEOPLE_ID,
          condition: [
            "=",
            ["field", ORDERS.USER_ID, null],
            ["field", PEOPLE.ID, { "join-alias": "People - User" }],
          ],
          alias: "People - User",
        },
      ],
      aggregation: [["count"]],
      breakout: [
        ["field", ORDERS.TOTAL, { binning: { strategy: "default" } }],
        ["field", PEOPLE.SOURCE, { "join-alias": "People - User" }],
      ],
    },
    database: SAMPLE_DB_ID,
  },
  display: "table",
};

describe("issue 27873", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show a group by column from the joined field in the summarize sidebar (metabase#27873)", () => {
    visitQuestionAdhoc(questionDetails);
    summarize();

    cy.findByTestId("aggregation-item").should("have.text", "Count");
    cy.findByTestId("pinned-dimensions")
      .should("contain", "Total")
      .and("contain", "People - User → Source");
  });
});
