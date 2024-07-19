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

  const MONTH_WITH_4_DAY_ROWS = "2015-02-01";
  const MONTH_WITH_5_DAY_ROWS = "2024-05-01";
  const MONTH_WITH_6_DAY_ROWS = "2024-06-01";

  // TODO:
  // - [] before/after/on (single calendar)
  // - [] between (two calendars)
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("calendar has constant size (metabase#39487", () => {
    createTimeSeriesQuestionWithFilter([
      "between",
      CREATED_AT_FIELD,
      MONTH_WITH_5_DAY_ROWS,
      MONTH_WITH_6_DAY_ROWS,
    ]);

    cy.findByTestId("timeseries-filter-button").click();

    measureDatetimeFilterPicker().then(initialHeight => {
      cy.wrap(initialHeight).as("initialHeight");
    });

    nextMonth().click();

    cy.get("@initialHeight").then(initialHeight => {
      measureDatetimeFilterPicker().then(height => {
        expect(height).to.eq(initialHeight);
      });
    });
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
