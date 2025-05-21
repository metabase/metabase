const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { NativeQuestionDetails } from "e2e/support/helpers";
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
    H.restore();
    cy.signInAsNormalUser();
  });

  it(
    "calendar has constant size when using single date picker filter (metabase#39487)",
    { viewportHeight: 1000 },
    () => {
      createTimeSeriesQuestionWithFilter([">", CREATED_AT_FIELD, "2015-01-01"]); // 5 day rows

      cy.log("timeseries filter button");
      cy.findByTestId("timeseries-filter-button").click();
      checkSingleDateFilter();

      cy.log("filter pills");
      cy.findByTestId("filters-visibility-control").click();
      cy.findByTestId("filter-pill").click();
      checkSingleDateFilter();

      cy.log("filter picker");
      cy.button(/Filter/).click();
      H.popover().within(() => {
        cy.findByText("Created At").click();
        cy.findByText("Fixed date range…").click();
      });
      checkSingleDateFilter();
      cy.realPress("Escape");

      cy.log("filter drill");
      cy.findByLabelText("Switch to data").click();
      H.tableHeaderClick("Created At: Year");
      H.popover().findByText("Filter by this column").click();

      cy.log("verify that previous popover is closed before opening new one");
      H.popover().findByText("Filter by this column").should("not.exist");

      H.popover().findByText("Fixed date range…").click();
      H.popover().findByText("After").click();
      H.popover().findByRole("textbox").clear().type("2015/01/01");
      checkSingleDateFilter();

      cy.log("notebook editor");
      H.openNotebook();
      H.getNotebookStep("filter")
        .findAllByTestId("notebook-cell-item")
        .first()
        .click();
      checkSingleDateFilter();
    },
  );

  // broken after migration away from filter modal
  // see https://github.com/metabase/metabase/issues/55688
  it.skip(
    "calendar has constant size when using date range picker filter (metabase#39487)",
    { viewportHeight: 1000 },
    () => {
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
      cy.button(/Filter/).click();
      H.modal().findByText("May 1 – Jun 1, 2024").click();
      checkDateRangeFilter();
      H.modal().button("Close").click();

      cy.log("filter drill");
      cy.findByLabelText("Switch to data").click();
      H.tableHeaderClick("Created At: Year");
      H.popover().findByText("Filter by this column").click();
      H.popover().findByText("Fixed date range…").click();
      H.popover().findAllByRole("textbox").first().clear().type("2024/05/01");
      // eslint-disable-next-line no-unsafe-element-filtering
      H.popover().findAllByRole("textbox").last().clear().type("2024/06/01");
      previousButton().click();
      checkDateRangeFilter();

      cy.log("notebook editor");
      H.openNotebook();
      H.getNotebookStep("filter")
        .findAllByTestId("notebook-cell-item")
        .first()
        .click();
      checkDateRangeFilter();
    },
  );

  it("date picker is scrollable when overflows (metabase#39487)", () => {
    createTimeSeriesQuestionWithFilter([
      ">",
      CREATED_AT_FIELD,
      "2015-03-01", // 6 day rows
    ]);

    H.openNotebook();
    H.getNotebookStep("filter")
      .findAllByTestId("notebook-cell-item")
      .first()
      .click();
    H.popover().scrollTo("bottom");
    H.popover().button("Update filter").should("be.visible").click();
  });

  function createTimeSeriesQuestionWithFilter(filter: Filter) {
    H.createQuestion(
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
    measureDatetimeFilterPickerHeight().then((initialPickerHeight) => {
      cy.wrap(initialPickerHeight).as("initialPickerHeight");
    });
    measureNextButtonRect().then((nextButtonRect) => {
      cy.wrap(nextButtonRect).as("nextButtonRect");
    });
    measurePreviousButtonRect().then((previousButtonRect) => {
      cy.wrap(previousButtonRect).as("previousButtonRect");
    });
  }

  function assertNoLayoutShift() {
    assertDatetimeFilterPickerHeightDidNotChange();
    assertPreviousButtonRectDidNotChange();
    assertNextButtonRectDidNotChange();
  }

  function assertDatetimeFilterPickerHeightDidNotChange() {
    cy.get("@initialPickerHeight").then((initialPickerHeight) => {
      measureDatetimeFilterPickerHeight().then((height) => {
        expect(height).to.eq(initialPickerHeight);
      });
    });
  }

  function assertPreviousButtonRectDidNotChange() {
    cy.get("@previousButtonRect").then((previousButtonRect) => {
      measurePreviousButtonRect().then((rect) => {
        expect(rect).to.deep.eq(previousButtonRect);
      });
    });
  }

  function assertNextButtonRectDidNotChange() {
    cy.get("@nextButtonRect").then((nextButtonRect) => {
      measureNextButtonRect().then((rect) => {
        expect(rect).to.deep.eq(nextButtonRect);
      });
    });
  }

  function measureDatetimeFilterPickerHeight() {
    return H.popover().then(([$element]) => {
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
    return H.popover().get("button[data-direction=next]");
  }

  function previousButton() {
    return H.popover().get("button[data-direction=previous]");
  }
});

const MONGO_DB_ID = 2;

describe("issue 47793", () => {
  const questionDetails: NativeQuestionDetails = {
    database: MONGO_DB_ID,
    native: {
      query: `[
  { $match: { quantity: {{quantity}} }},
  {
    "$project": {
      "_id": "$_id",
      "id": "$id",
      "user_id": "$user_id",
      "product_id": "$product_id",
      "subtotal": "$subtotal",
      "tax": "$tax",
      "total": "$total",
      "created_at": "$created_at",
      "quantity": "$quantity",
      "discount": "$discount"
    }
  },
  {
    "$limit": 1048575
  }
]`,
      "template-tags": {
        quantity: {
          type: "number",
          name: "quantity",
          id: "754ae827-661c-4fc9-b511-c0fb7b6bae2b",
          "display-name": "Quantity",
          default: "10",
        },
      },
      collection: "orders",
    },
  };

  beforeEach(() => {
    H.restore("mongo-5");
    cy.signInAsAdmin();
  });

  it(
    "should be able to preview queries for mongodb (metabase#47793)",
    { tags: ["@external", "@mongo"] },
    () => {
      H.createNativeQuestion(questionDetails, { visitQuestion: true });
      cy.findByTestId("visibility-toggler")
        .findByText(/open editor/i)
        .click();
      cy.findByTestId("native-query-editor-container")
        .findByLabelText("Preview the query")
        .click();
      H.modal()
        .should("contain.text", "$project")
        .and("contain.text", "quantity: 10");
    },
  );
});

describe("issue 49270", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("document title should not indicate that loading takes place when query has errored (metabase#49270)", () => {
    H.openOrdersTable();
    cy.icon("sum").click();

    cy.intercept("POST", "/api/dataset", (request) => {
      request.reply({ statusCode: 500, delay: 1000 });
    });

    cy.button("Done").click();
    cy.title().should("equal", "Doing science... · Metabase");
    cy.title().should("equal", "Question · Metabase");
  });
});

describe("issue 53404", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should show an error message when overwriting a card with a cycle (metabase#53404)", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    H.openNotebook();
    H.getNotebookStep("data").button("Join data").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Collections").click();
      cy.findByText("Orders").click();
    });
    H.popover().findByText("ID").click();
    H.popover().findByText("ID").click();
    H.queryBuilderHeader().button("Save").click();
    H.modal().within(() => {
      cy.button("Save").click();
      cy.wait("@updateCard");
      cy.findByText("Cannot save card with cycles.").should("be.visible");
      cy.findByText(/undefined/).should("not.exist");
    });
  });
});

describe("issue 53170", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it(
    "should correctly position the add column popover (metabase#53170)",
    { viewportWidth: 480, viewportHeight: 800 },
    () => {
      H.openOrdersTable();
      cy.findByLabelText("Add column").click();
      H.popover().within(() => {
        cy.findByText("Combine columns").click();
        cy.button("Done").then(($button) => {
          const buttonRight = $button[0].getBoundingClientRect().right;
          cy.window().its("innerWidth").should("be.gt", buttonRight);
        });
      });
    },
  );
});

describe("issue 54817", () => {
  const placeholder = "Find...";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to navigate to the search input in the filter picker via keyboard (metabase#54817)", () => {
    H.openOrdersTable();
    H.filter();
    H.popover().findByPlaceholderText(placeholder).should("be.focused");
  });
});

describe("issue 57398", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show the query running state when navigating back (metabase#57398)", () => {
    H.openProductsTable();
    H.filter();
    H.popover().within(() => {
      cy.log("1st filter");
      cy.findByText("Category").click();
      cy.findByText("Widget").click();
      cy.findByLabelText("Add another filter").click();

      cy.log("2st filter");
      cy.findByText("Vendor").click();
      cy.findByText("Alfreda Konopelski II Group").click();
      cy.findByLabelText("Add another filter").click();
    });

    cy.log("delay the response to be able to verify the running state");
    cy.intercept("POST", "/api/dataset", (req) => {
      req.on("response", (res) => {
        res.setDelay(5000);
      });
    });

    cy.go("back");
    H.queryBuilderMain().findByTestId("loading-indicator").should("be.visible");
    H.queryBuilderFiltersPanel().within(() => {
      cy.findByText("Category is Widget").should("be.visible");
      cy.findByText("Vendor is Alfreda Konopelski II Group").should(
        "not.exist",
      );
    });
  });
});
