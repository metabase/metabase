import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, filter, createQuestion } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe.skip("metabase#44550", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display the filter with an offset appropriately in the time-series chrome and in the filter modal (metabase#44550)", () => {
    const questionDetails = {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
            },
          ],
        ],
        filter: [
          "between",
          [
            "+",
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
              },
            ],
            ["interval", 7, "day"],
          ],
          ["relative-datetime", -30, "day"],
          ["relative-datetime", 0, "day"],
        ],
      },
      type: "query",
    };

    createQuestion(questionDetails, { visitQuestion: true });
    cy.findByTestId("filters-visibility-control").click();
    cy.findByTestId("filter-pill").should(
      "have.text",
      "Created At is in the previous 30 days, starting 7 days ago",
    );

    cy.log("Repro for the time-series chrome");
    cy.findByTestId("timeseries-filter-button")
      .should("not.have.text", "All time")
      .and("contain", /previous 30 days/i)
      .and("contain", /7 days ago/i);

    cy.log("Repro for the filter modal");
    filter();
    // Not entirely sure how the DOM looks like in this scenario.
    // TODO: Update the test if needed.
    cy.findByTestId("filter-column-Created At")
      .should("contain", /previous 30 days/i)
      .and("contain", /7 days ago/i);
  });
});
