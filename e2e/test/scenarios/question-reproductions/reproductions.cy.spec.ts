import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, popover, restore } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 39487", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
          filter: [
            "between",
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
              },
            ],
            // "2015-02-01", // has 4 rows of days
            "2024-05-01", // has 4 rows of days
            "2024-06-30", // has 6 rows of days
          ],
        },
        display: "line",
      },
      { visitQuestion: true },
    );
  });

  it("calendar has constant size (metabase#39487", () => {
    cy.findByTestId("timeseries-filter-button").click();

    measureDatetimeFilterPicker().then(initialHeight => {
      cy.wrap(initialHeight).as("initialHeight");
    });

    popover().findByRole("tab", { name: "Next" }).click();

    cy.get("@initialHeight").then(initialHeight => {
      measureDatetimeFilterPicker().then(height => {
        expect(height).to.eq(initialHeight);
      });
    });
  });

  function measureDatetimeFilterPicker() {
    return cy.findByTestId("datetime-filter-picker").then(([$element]) => {
      const { height } = $element.getBoundingClientRect();
      return height;
    });
  }
});
