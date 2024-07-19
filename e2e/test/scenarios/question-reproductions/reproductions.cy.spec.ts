import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, popover, restore } from "e2e/support/helpers";
import type { Filter, LocalFieldReference } from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 39487", () => {
  const CREATED_AT_FIELD: LocalFieldReference = [
    "field",
    ORDERS.CREATED_AT,
    {
      "base-type": "type/DateTime",
    },
  ];

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("calendar has constant size when using 'between' filter (metabase#39487)", () => {
    createTimeSeriesQuestionWithFilter([
      "between",
      CREATED_AT_FIELD,
      "2024-05-01", // 5 day rows
      "2024-06-01", // 6 day rows
    ]);

    cy.findByTestId("timeseries-filter-button").click();

    measureDatetimeFilterPicker().then(initialHeight => {
      cy.wrap(initialHeight).as("initialHeight");
    });

    nextMonth().click(); // go to 2024-07 - 5 day rows
    assertHeightDidNotChange();
  });

  it("calendar has constant size when using 'on' filter (metabase#39487)", () => {
    createTimeSeriesQuestionWithFilter(["=", CREATED_AT_FIELD, "2015-01-01"]); // 5 day rows

    cy.findByTestId("timeseries-filter-button").click();

    measureDatetimeFilterPicker().then(initialHeight => {
      cy.wrap(initialHeight).as("initialHeight");
    });

    nextMonth().click(); // go to 2015-02 - 4 day rows
    assertHeightDidNotChange();

    nextMonth().click(); // go to 2015-03 - 5 day rows
    assertHeightDidNotChange();

    nextMonth().click(); // go to 2015-04 - 5 day rows
    assertHeightDidNotChange();

    nextMonth().click(); // go to 2015-05 - 6 day rows
    assertHeightDidNotChange();

    nextMonth().click(); // go to 2015-05 - 6 day rows
    assertHeightDidNotChange();

    nextMonth().click(); // go to 2015-06 - 5 day rows
    assertHeightDidNotChange();
  });

  function createTimeSeriesQuestionWithFilter(filter: Filter) {
    createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
          filter,
        },
        display: "line",
      },
      { visitQuestion: true },
    );
  }

  function assertHeightDidNotChange() {
    cy.get("@initialHeight").then(initialHeight => {
      measureDatetimeFilterPicker().then(height => {
        expect(height).to.eq(initialHeight);
      });
    });
  }

  function measureDatetimeFilterPicker() {
    return cy.findByTestId("datetime-filter-picker").then(([$element]) => {
      const { height } = $element.getBoundingClientRect();
      return height;
    });
  }

  function nextMonth() {
    return popover().get("button[data-next]");
  }
});
