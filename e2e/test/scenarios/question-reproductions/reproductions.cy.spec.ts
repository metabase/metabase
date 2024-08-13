import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  getNotebookStep,
  openNotebook,
  modal,
  popover,
  restore,
  tableHeaderClick,
} from "e2e/support/helpers";
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
    cy.viewport(1280, 1000);
  });

  it("calendar has constant size when using single date picker filter (metabase#39487)", () => {
    createTimeSeriesQuestionWithFilter([">", CREATED_AT_FIELD, "2015-01-01"]); // 5 day rows

    cy.log("timeseries filter button");
    cy.findByTestId("timeseries-filter-button").click();
    checkSingleDateFilter();

    cy.log("filter pills");
    cy.findByTestId("filters-visibility-control").click();
    cy.findByTestId("filter-pill").click();
    checkSingleDateFilter();

    cy.log("filter modal");
    cy.button("Filter").click();
    modal().findByText("After Jan 1, 2015").click();
    checkSingleDateFilter();
    modal().button("Close").click();

    cy.log("filter drill");
    cy.findByLabelText("Switch to data").click();
    tableHeaderClick("Created At: Year");
    popover().findByText("Filter by this column").click();
    popover().findByText("Specific dates…").click();
    popover().findByText("After").click();
    popover().findByRole("textbox").clear().type("2015/01/01");
    checkSingleDateFilter();

    cy.log("notebook editor");
    openNotebook();
    getNotebookStep("filter")
      .findAllByTestId("notebook-cell-item")
      .first()
      .click();
    checkSingleDateFilter();
  });

  it("calendar has constant size when using date range picker filter (metabase#39487)", () => {
    createTimeSeriesQuestionWithFilter([
      "between",
      CREATED_AT_FIELD,
      "2024-05-01", // 5 day rows
      "2024-06-01", // 6 day rows
    ]);

    cy.log("timeseries filter button");
    cy.findByTestId("timeseries-filter-button").click();
    checkDateRangeFilter();

    cy.log("filter pills");
    cy.findByTestId("filters-visibility-control").click();
    cy.findByTestId("filter-pill").click();
    checkDateRangeFilter();

    cy.log("filter modal");
    cy.button("Filter").click();
    modal().findByText("May 1 – Jun 1, 2024").click();
    checkDateRangeFilter();
    modal().button("Close").click();

    cy.log("filter drill");
    cy.findByLabelText("Switch to data").click();
    tableHeaderClick("Created At: Year");
    popover().findByText("Filter by this column").click();
    popover().findByText("Specific dates…").click();
    popover().findAllByRole("textbox").first().clear().type("2024/05/01");
    popover().findAllByRole("textbox").last().clear().type("2024/06/01");
    previousButton().click();
    checkDateRangeFilter();

    cy.log("notebook editor");
    openNotebook();
    getNotebookStep("filter")
      .findAllByTestId("notebook-cell-item")
      .first()
      .click();
    checkDateRangeFilter();
  });

  it("date picker is scrollable when overflows (metabase#39487)", () => {
    cy.viewport(1280, 800);
    createTimeSeriesQuestionWithFilter([
      ">",
      CREATED_AT_FIELD,
      "2015-03-01", // 6 day rows
    ]);

    openNotebook();
    getNotebookStep("filter")
      .findAllByTestId("notebook-cell-item")
      .first()
      .click();
    popover().scrollTo("bottom");
    popover().button("Update filter").should("be.visible").click();
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

  function checkSingleDateFilter() {
    measureInitialValues();

    nextButton().click(); // go to 2015-02 - 4 day rows
    assertNoLayoutShift();

    nextButton().click(); // go to 2015-03 - 5 day rows
    assertNoLayoutShift();

    nextButton().click(); // go to 2015-04 - 5 day rows
    assertNoLayoutShift();

    nextButton().click(); // go to 2015-05 - 6 day rows
    assertNoLayoutShift();
  }

  function checkDateRangeFilter() {
    measureInitialValues();

    nextButton().click(); // go to 2024-07 - 5 day rows
    assertNoLayoutShift();
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
    return popover().then(([$element]) => {
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
