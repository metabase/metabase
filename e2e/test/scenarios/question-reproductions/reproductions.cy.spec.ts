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

  it("calendar has constant size when using single date picker filter (metabase#39487)", () => {
    createTimeSeriesQuestionWithFilter(["=", CREATED_AT_FIELD, "2015-01-01"]); // 5 day rows

    cy.findByTestId("timeseries-filter-button").click();

    measureInitialValues();

    nextButton().click(); // go to 2015-02 - 4 day rows
    assertNoLayoutShift();

    nextButton().click(); // go to 2015-03 - 5 day rows
    assertNoLayoutShift();

    nextButton().click(); // go to 2015-04 - 5 day rows
    assertNoLayoutShift();

    nextButton().click(); // go to 2015-05 - 6 day rows
    assertNoLayoutShift();

    popover().button("May 2015").click(); // go to year view
    assertNoLayoutShift();

    popover().button("2015").click(); // go to decade view
    assertNoLayoutShift();
  });

  it("calendar has constant size when using date range filter (metabase#39487)", () => {
    createTimeSeriesQuestionWithFilter([
      "between",
      CREATED_AT_FIELD,
      "2024-05-01", // 5 day rows
      "2024-06-01", // 6 day rows
    ]);

    cy.findByTestId("timeseries-filter-button").click();

    measureInitialValues();

    nextButton().click(); // go to 2024-07 - 5 day rows
    assertNoLayoutShift();

    popover().button("July 2024").click(); // go to year view
    assertNoLayoutShift();

    popover().button("2024").click(); // go to decade view
    assertNoLayoutShift();
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

  function measureInitialValues() {
    measureDatetimeFilterPickerHeight().then(initialPickerHeight => {
      cy.wrap(initialPickerHeight).as("initialPickerHeight");
    });
    measureNextButtonRect().then(nextButtonRect => {
      cy.wrap(nextButtonRect).as("nextButtonRect");
    });
    measurePreviousButtonRect().then(previousButtonRect => {
      cy.wrap(previousButtonRect).as("previousButtonRect");
    });
  }

  function assertNoLayoutShift() {
    assertDatetimeFilterPickerHeightDidNotChange();
    assertPreviousButtonRectDidNotChange();
    assertNextButtonRectDidNotChange();
  }

  function assertDatetimeFilterPickerHeightDidNotChange() {
    cy.get("@initialPickerHeight").then(initialPickerHeight => {
      measureDatetimeFilterPickerHeight().then(height => {
        expect(height).to.eq(initialPickerHeight);
      });
    });
  }

  function assertPreviousButtonRectDidNotChange() {
    cy.get("@previousButtonRect").then(previousButtonRect => {
      measurePreviousButtonRect().then(rect => {
        expect(rect).to.deep.eq(previousButtonRect);
      });
    });
  }

  function assertNextButtonRectDidNotChange() {
    cy.get("@nextButtonRect").then(nextButtonRect => {
      measureNextButtonRect().then(rect => {
        expect(rect).to.deep.eq(nextButtonRect);
      });
    });
  }

  function measureDatetimeFilterPickerHeight() {
    return cy.findByTestId("datetime-filter-picker").then(([$element]) => {
      const { height } = $element.getBoundingClientRect();
      return height;
    });
  }

  function measureNextButtonRect() {
    return nextButton().then(([$element]) => {
      return $element.getBoundingClientRect();
    });
  }

  function measurePreviousButtonRect() {
    return previousButton().then(([$element]) => {
      return $element.getBoundingClientRect();
    });
  }

  function nextButton() {
    return popover().get("button[data-next]");
  }

  function previousButton() {
    return popover().get("button[data-previous]");
  }
});
