const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { Filter, LocalFieldReference } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

describe("issue 48754", () => {
  const questionDetails: StructuredQuestionDetails = {
    name: "Q1",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should (metabase#48754)", () => {
    H.createQuestion(questionDetails);
    H.openReviewsTable({ mode: "notebook" });
    H.getNotebookStep("data").button("Summarize").click();
    H.popover().findByText("Count of rows").click();
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
    });
    H.getNotebookStep("summarize").button("Join data").click();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Q1").click();
    });
    H.popover()
      .findByText(/Category/)
      .click();
    H.popover()
      .findByText(/Category/)
      .click();
    H.visualize();
    H.assertQueryBuilderRowCount(4);
  });
});

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

  it(
    "calendar has constant size when using date range picker filter, and text inputs are in sync with the calendar inputs (metabase#39487, metabase#64602)",
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

      cy.log("filter dropdown");
      cy.button(/Filter/).click();
      H.popover().findByText("Created At").click();
      H.popover().findByText("Fixed date range…").click();
      H.popover().within(() => {
        cy.log(
          "changing text input values should navigate the calendars (metabase#64602)",
        );
        cy.findAllByRole("textbox").first().clear().type("2024/05/01");
        cy.findByText("May 2024").should("be.visible");
        cy.findByLabelText("1 May 2024").should(
          "have.attr",
          "data-first-in-range",
          "true",
        );

        cy.findAllByRole("textbox")
          .should("have.length", 2)
          .last()
          .clear()
          .type("2024/06/01");
        cy.findAllByLabelText("1 June 2024")
          .filter(":visible")
          .should("have.length", 1)
          .and("have.attr", "data-last-in-range", "true");
      });
      previousButton().click();
      checkDateRangeFilter();
      cy.realPress("Escape");

      cy.log("filter drill");
      cy.findByLabelText("Switch to data").click();
      H.tableHeaderClick("Created At: Year");
      H.popover().findByText("Filter by this column").click();
      H.popover().findByText("Fixed date range…").click();
      H.popover().findAllByRole("textbox").first().clear().type("2024/05/01");
      H.popover()
        .findAllByRole("textbox")
        .should("have.length", 2)
        .last()
        .clear()
        .type("2024/06/01");
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
    H.popover().findByTestId("popover-content").scrollTo("bottom");
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

describe("issue 14124", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not include date when metric is binned by hour of day (metabase#14124)", () => {
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });

    H.createQuestion(
      {
        name: "14124",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
          ],
        },
      },
      { visitQuestion: true },
    );

    cy.findAllByRole("columnheader", {
      name: "Created At: Hour of day",
    }).should("be.visible");

    cy.log("Reported failing in v0.37.2");
    cy.findAllByRole("gridcell", { name: "3:00 AM" }).should("be.visible");
  });
});

describe("issue 15563", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not display multiple 'Created At' fields when they are remapped to PK/FK (metabase#15563)", () => {
    // Remap fields
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: "type/PK",
    });
    cy.request("PUT", `/api/field/${REVIEWS.CREATED_AT}`, {
      semantic_type: "type/FK",
      fk_target_field_id: ORDERS.CREATED_AT,
    });

    H.openReviewsTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.popover().findByText("Count of rows").click();
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    cy.get("[data-element-id=list-section-header]")
      .contains("Created At")
      .click();
    cy.get("[data-element-id=list-section] [data-element-id=list-item-title]")
      .contains("Created At")
      .should("have.length", 1);
  });
});

describe("issue 36122", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should display breakouts group for all FKs (metabase#36122)", () => {
    cy.request("PUT", `/api/field/${REVIEWS.RATING}`, {
      semantic_type: "type/FK",
      fk_target_field_id: PRODUCTS.ID,
    });

    H.openReviewsTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();

    H.popover().within(() => {
      cy.findAllByTestId("dimension-list-item")
        .eq(3)
        .should("have.text", "Rating");
      cy.get("[data-element-id=list-section-header]").should("have.length", 3);
      cy.get("[data-element-id=list-section-header]")
        .eq(0)
        .should("have.text", "Reviews");
      cy.get("[data-element-id=list-section-header]")
        .eq(1)
        .should("have.text", "Product");
      cy.get("[data-element-id=list-section-header]")
        .eq(2)
        .should("have.text", "Rating");
    });
  });
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

describe("issue 48752", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should reference the correct aggregation after one of the aggregations with the same operator is removed (metabase#48752)", () => {
    H.openOrdersTable({ mode: "notebook" });

    cy.log("first stage - aggregations and a breakout");
    H.summarize({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText(/Sum of/).click();
      cy.findByText("Total").click();
    });
    H.getNotebookStep("summarize").icon("add").click();
    H.popover().within(() => {
      cy.findByText(/Sum of/).click();
      cy.findByText("Subtotal").click();
    });
    H.getNotebookStep("summarize").icon("add").click();
    H.popover().within(() => {
      cy.findByText(/Sum of/).click();
      cy.findByText("Tax").click();
    });
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().findByText("User ID").click();

    cy.log("second stage - a filter");
    H.getNotebookStep("summarize").button("Filter").click();
    H.popover().within(() => {
      cy.findByText("Sum of Subtotal").click();
      cy.findByPlaceholderText("Min").type("10");
      cy.findByText("Add filter").click();
    });

    cy.log('remove the first "sum" aggregation from the first stage');
    H.getNotebookStep("summarize")
      .findByText("Sum of Total")
      .icon("close")
      .click();

    cy.log("assert that the filter references the correct column");
    H.getNotebookStep("filter", { stage: 1 })
      .findByText("Sum of Subtotal is greater than or equal to 10")
      .should("be.visible");
  });
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
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
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

describe("issue 46845", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to run a query with an implicit join via a join (metabase#46845)", () => {
    H.openOrdersTable({ mode: "notebook" });

    cy.log("add a self-join");
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    H.popover().findByText("Product ID").click();
    H.popover().findByText("User ID").click();

    cy.log("add a filter for an implicit column from the source table");
    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findAllByText("Product").should("have.length", 2).first().click();
      cy.findByText("Vendor").click();
      cy.findByText("Alfreda Konopelski II Group").click();
      cy.button("Add filter").click();
    });

    cy.log("add a filter for the column but from the joined table");
    H.getNotebookStep("filter").icon("add").click();
    H.popover().within(() => {
      cy.findAllByText("Product").should("have.length", 2).last().click();
      cy.findByText("Vendor").click();
      cy.findByText("Aufderhar-Boehm").click();
      cy.button("Add filter").click();
    });

    cy.log("assert query results");
    H.visualize();
    H.assertQueryBuilderRowCount(91);
  });

  it("should be able to run a query with multiple implicit joins for a native model (metabase#46845)", () => {
    cy.log("create a native model with 2 FKs to the same table");
    H.createNativeQuestion(
      {
        name: "Model",
        type: "model",
        native: {
          query:
            "SELECT 1 AS PK, 5 AS FK1, 9 AS FK2 " +
            "UNION ALL " +
            "SELECT 2 AS PK, 4 AS FK1, 7 AS FK2",
        },
      },
      { visitQuestion: true },
    );
    H.openQuestionActions("Edit metadata");
    H.openColumnOptions("PK");
    H.mapColumnTo({ table: "Orders", column: "ID" });
    H.renameColumn("ID", "PK");

    H.openColumnOptions("FK1");
    H.mapColumnTo({ table: "Orders", column: "Product ID" });
    H.renameColumn("Product ID", "First Product ID");

    H.openColumnOptions("FK2");
    H.mapColumnTo({ table: "Orders", column: "Product ID" });
    H.renameColumn("Product ID", "Second Product ID");
    H.saveMetadataChanges();

    cy.log("verify filtering on 2 different implicit column groups");
    H.openNotebook();
    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("First Product").click();
      cy.findByText("Category").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.getNotebookStep("filter").icon("add").click();
    H.popover().within(() => {
      cy.findByText("Second Product").click();
      cy.findByText("Category").click();
      cy.findByText("Widget").click();
      cy.button("Add filter").click();
    });
    H.visualize();
    H.assertQueryBuilderRowCount(1);
  });
});

describe("issue 44567", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to name the aggregation expression the same as the column it is aggregating (metabase#44567)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.getNotebookStep("data").button("Summarize").click();
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({ formula: "Sum([Total])", name: "Total" });
    H.popover().button("Done").click();
    H.getNotebookStep("summarize").findByText("Total").click();
    H.enterCustomColumnDetails({ formula: "Sum([Total]) + 1" });
    H.popover().button("Update").should("be.enabled");
  });
});

describe("issue 58829", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to use join native models when SQL column names do not match the names of the mapped fields (metabase#58829)", () => {
    cy.log("create a native model mapped columns");
    H.createNativeQuestion(
      {
        name: "M1",
        type: "model",
        native: {
          query: "SELECT 1 AS ID, 2 AS _USER_ID",
        },
      },
      { visitQuestion: true },
    );
    H.openQuestionActions("Edit metadata");
    H.openColumnOptions("ID");
    H.mapColumnTo({ table: "Orders", column: "ID" });
    H.openColumnOptions("_USER_ID");
    H.mapColumnTo({ table: "Orders", column: "User ID" });
    H.saveMetadataChanges();

    cy.log("verify it can be joined");
    H.openProductsTable({ mode: "notebook" });
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("M1").click();
    });
    H.popover().findByText("ID").click();
    H.popover().findByText("ID").click();
    H.visualize();
    H.assertQueryBuilderRowCount(200);
  });
});

describe("54205", () => {
  beforeEach(() => {
    H.restore("postgres-writable");

    cy.signInAsAdmin();

    H.queryWritableDB("DROP TABLE IF EXISTS products");
    H.queryWritableDB(
      "CREATE TABLE IF NOT EXISTS products (id INT PRIMARY KEY, category VARCHAR, name VARCHAR)",
    );
    H.queryWritableDB(
      "INSERT INTO products (id, category, name) VALUES (1, 'A', 'Foo, Bar'), (2, 'B', 'Foo, Baz')",
    );
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "products" });
  });

  it("should be able to select a comma separated value", () => {
    H.getTableId({
      name: "products",
    }).then((tableId) => {
      H.getFieldId({
        tableId,
        name: "name",
      }).then((fieldId) => {
        cy.request("PUT", `/api/field/${fieldId}`, {
          has_field_values: "search",
        });
      });

      H.createTestQuery({
        database: WRITABLE_DB_ID,
        stages: [
          {
            source: {
              type: "table",
              id: tableId,
            },
          },
        ],
      }).then((query) => {
        H.createCard({
          name: "Q 54205",
          dataset_query: query,
        }).then((card) => {
          cy.wrap(card.id).as("questionId");
          H.visitQuestion(card.id);
        });
      });
    });

    cy.findByTestId("query-visualization-root").contains("Name").click();

    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search by Name").type("Foo");
      cy.findByRole("option", { name: "Foo, Bar" }).click();
      cy.findByRole("list").should("have.text", "Foo, Bar");
    });
  });
});

describe("issue 54920", () => {
  const initialQuestionDetails: StructuredQuestionDetails = {
    name: "Base question",
    query: {
      "source-table": ORDERS_ID,
      fields: [["field", ORDERS.CREATED_AT, null]],
      joins: [
        {
          "source-table": PRODUCTS_ID,
          alias: "Products",
          fields: [
            ["field", PRODUCTS.CREATED_AT, { "join-alias": "Products" }],
          ],
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
        },
        {
          "source-table": REVIEWS_ID,
          alias: "Reviews",
          fields: [["field", REVIEWS.CREATED_AT, { "join-alias": "Reviews" }]],
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", REVIEWS.PRODUCT_ID, { "join-alias": "Reviews" }],
          ],
        },
      ],
    },
  };

  const expectedRowCount = 407;

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should not break downstream queries when an unused field with the same name as a used field is removed from a base question (metabase#54920)", () => {
    cy.log("create a base question");
    H.createQuestion(initialQuestionDetails, {
      wrapId: true,
      idAlias: "baseQuestionId",
    });

    cy.log("create a derived question and verify that it can be run");
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Base question").click();
    });
    H.getNotebookStep("filter")
      .findByText("Add filters to narrow your answer")
      .click();
    H.popover().within(() => {
      cy.findByText("Reviews → Created At").click();
      cy.findByText("Fixed date range…").click();
      cy.findByLabelText("Start date").clear().type("10/12/2024");
      cy.findByLabelText("End date").clear().type("10/15/2024");
      cy.button("Add filter").click();
    });
    H.visualize();
    H.assertQueryBuilderRowCount(expectedRowCount);
    H.saveQuestion("Derived question", {
      wrapId: true,
      idAlias: "derivedQuestionId",
    });

    cy.log("remove a column from the base question");
    H.visitQuestion("@baseQuestionId");
    H.openNotebook();
    H.getNotebookStep("join", { index: 0 }).button("Pick columns").click();
    H.popover().findByText("Created At").click();
    H.queryBuilderHeader().findByText("Save").click();
    H.modal().findByText("Save").click();
    cy.wait("@updateCard");

    cy.log("verify that the derived question still works");
    H.visitQuestion("@derivedQuestionId");
    H.assertQueryBuilderRowCount(expectedRowCount);
  });
});

describe("issue 55631", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    cy.intercept("POST", "/api/card").as("cardCreate");
  });

  it("should not flash the default title when saving the question (metabase#55631)", () => {
    H.visualize();
    cy.findByTestId("qb-header").button("Save").click();

    H.modal().within(() => {
      cy.findByLabelText("Name").clear().type("Custom");
      cy.findByLabelText("Where do you want to save this?").click();
    });

    H.pickEntity({ path: ["Our analytics", "First collection"], select: true });

    H.modal().within(() => {
      cy.button("Save").click();
      cy.wait("@cardCreate");

      // It is important to have extremely short timeout in order to catch the issue
      // before the dialog closes.
      cy.findByDisplayValue("Orders", { timeout: 10 }).should("not.exist");
    });
  });
});

describe("issue 39033", () => {
  const question1Name = "Q1";
  const question1Details: NativeQuestionDetails = {
    name: question1Name,
    native: {
      query: "select id, product_id, total from orders",
      "template-tags": {},
    },
  };

  const question2Name = "Q2";
  const question2Details: NativeQuestionDetails = {
    name: question2Name,
    native: {
      query: "select * from products",
      "template-tags": {},
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  function getJoinedColumn() {
    return cy
      .findByTestId(`${question2Name.toLowerCase()}-table-columns`)
      .findByLabelText(`${question2Name} - PRODUCT_ID → ID`);
  }

  it("should correctly mark columns as selected when joining a native query (metabase#39033)", () => {
    cy.log("create a question");
    H.createNativeQuestion(question1Details);
    H.createNativeQuestion(question2Details);
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText(question1Name).click();
    });
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText(question2Name).click();
    });
    H.popover().findByText("PRODUCT_ID").click();
    H.popover().findByText("ID").click();

    cy.log("run the query");
    H.visualize();
    cy.wait("@dataset");

    cy.log("assert that columns are marked as selected correctly");
    H.openVizSettingsSidebar();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.button("Add or remove columns").click();

      getJoinedColumn().should("be.checked").click();
      getJoinedColumn().should("not.be.checked");
      cy.wait("@dataset");

      getJoinedColumn().should("not.be.checked").click();
      getJoinedColumn().should("be.checked");
      cy.wait("@dataset");
    });
  });
});

describe("issue 56416", () => {
  // name should be longer than the default 60-character limit; this has 71
  const joinedQuestionName =
    "Orders + Products, Count, Grouped by Products → Category and Product ID";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to use a column from a joined question with a long name (metabase#56416)", () => {
    cy.log("create the joined question");
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Products").click();
    });
    H.getNotebookStep("summarize")
      .findByText("Pick a function or metric")
      .click();
    H.popover().findByText("Count of rows").click();
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().within(() => {
      cy.findByText("Products").click();
      cy.findByText("Category").click();
    });
    H.getNotebookStep("summarize")
      .findByTestId("breakout-step")
      .icon("add")
      .click();
    H.popover().findByText("Product ID").click();
    H.saveQuestion(joinedQuestionName);

    cy.log("create the main question");
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText(joinedQuestionName).click();
    });
    H.popover().findByText("Product ID").click();
    H.popover().findByText("Product ID").click();
    H.getNotebookStep("summarize")
      .findByText("Pick a function or metric")
      .click();
    H.popover().findByText("Count of rows").click();
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().within(() => {
      cy.findByText(joinedQuestionName).click();
      cy.findByText(/→ Category$/).click();
    });
    H.getNotebookStep("summarize").icon("filter").click();
    H.popover().within(() => {
      cy.findByText(/→ Category$/).click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });

    cy.log("assert that the query can be run");
    H.visualize();
    H.assertQueryBuilderRowCount(1);
  });
});

describe("issue 55487", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able open object details on browser forward navigation (metabase#55487)", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("table-body")
      .get("[data-index='4']")
      .within(() => {
        cy.get("[data-column-id='ID']").click();
      });

    cy.findByTestId("object-detail").should("be.visible");

    cy.go("back");

    cy.findByTestId("object-detail").should("not.exist");

    cy.go("forward");

    cy.findByTestId("object-detail").should("be.visible");
  });
});

describe("issue 42723", () => {
  const questionDetails: StructuredQuestionDetails = {
    display: "line",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CREATED_AT, { "base-type": "type/DateTime" }],
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to change the query without loosing the viz type (metabase#42723)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.queryBuilderFooter().findByLabelText("Switch to data").click();
    H.tableHeaderClick("Count");
    H.popover().icon("arrow_up").click();
    H.tableInteractiveHeader().icon("chevronup").should("be.visible");

    H.queryBuilderFooter().findByLabelText("Switch to visualization").click();
    H.ensureChartIsActive();
  });
});

describe("issue 58628", () => {
  beforeEach(() => {
    H.restore();
    cy.signIn("nodata");
  });

  it("should show the unauthorized page when accessing the notebook editor without data perms (metabase#58628)", () => {
    cy.log("should not be able to access the notebook editor");
    cy.visit("/question/notebook");
    cy.url().should("include", "/unauthorized");
    H.main()
      .findByText("Sorry, you don’t have permission to see that.")
      .should("be.visible");

    cy.log("should be able to access the query builder in view mode");
    H.visitQuestion(ORDERS_QUESTION_ID);
    H.queryBuilderHeader().should("be.visible");
  });
});

describe("issue 52872", () => {
  const LONG_NAME = "a".repeat(254);

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        name: LONG_NAME,
        query: {
          "source-table": ORDERS_ID,
        },
      },
      { visitQuestion: true },
    );
  });

  it("Saved questions with a very long title should wrap (metabse#52872)", () => {
    cy.findByDisplayValue(LONG_NAME)
      .should("be.visible")
      .then(($el) => {
        cy.window().then((window) => {
          cy.wrap($el[0].offsetWidth).should("be.lt", window.innerWidth);
        });
      });
  });
});

describe("issue 35561", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should display a functional fk drill for both null and non-null values", () => {
    H.createNativeQuestion(
      {
        name: "Model",
        native: {
          query: `SELECT 1 AS ID, CAST(NULL AS INT) AS USER_ID
UNION ALL
SELECT 2 AS ID, 3 AS USER_ID
`,
        },
        type: "model",
      },
      {},
    ).then(async ({ body: model }) => {
      await cy.request("POST", `/api/card/${model.id}/query`);
      await H.setModelMetadata(model.id, (field) => {
        if (field.name === "USER_ID") {
          return {
            ...field,
            display_name: "User ID",
            semantic_type: "type/FK",
            fk_target_field_id: ORDERS.ID,
          };
        }
        return field;
      });
      H.createQuestion(
        {
          name: "Question",
          query: {
            "source-table": `card__${model.id}`,
          },
          display: "table",
        },
        { wrapId: true, visitQuestion: true },
      );
    });

    cy.findByTestId("table-root")
      .findAllByRole("row")
      .first()
      .within(() => {
        cy.get("[data-column-id='USER_ID']").click();
      });
    H.popover().within(() => {
      cy.findByText("View Models with no User").should("be.visible").click();
    });
    cy.findByTestId("table-body").within(() => {
      cy.findAllByRole("row").should("have.length", 1);
      cy.findAllByRole("row")
        .first()
        .within(() => {
          cy.get("[data-column-id='USER_ID']").within(() => {
            cy.get("[data-testid=cell-data]").should("not.exist");
          });
        });
    });

    H.visitQuestion("@questionId");

    cy.findByTestId("table-root")
      .findAllByRole("row")
      .eq(1)
      .within(() => {
        cy.get("[data-column-id='USER_ID']").click();
      });
    H.popover().within(() => {
      cy.findByText("View this User's Models").should("be.visible").click();
    });
    cy.findByTestId("table-body").within(() => {
      cy.findAllByRole("row").should("have.length", 1);
      cy.findAllByRole("row")
        .first()
        .within(() => {
          cy.get("[data-column-id='USER_ID']").within(() => {
            cy.get("[data-testid=cell-data]").should("have.text", "3");
          });
        });
    });
  });
});

describe("issue 64293", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to run a query for a empty required parameter without a default value (metabase#64293)", () => {
    const questionDetails: NativeQuestionDetails = {
      name: "Question 1",
      native: {
        query: "SELECT * FROM PEOPLE WHERE state = {{State}}",
        "template-tags": {
          State: {
            type: "text",
            name: "State",
            id: "1",
            "display-name": "State",
          },
        },
      },
      parameters: [
        createMockParameter({
          id: "1",
          slug: "State",
          required: true,
          name: "State",
        }),
      ],
    };

    H.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.findByPlaceholderText("State").should("exist");
    cy.findByPlaceholderText("State").type("NY{enter}");

    H.runButtonOverlay().should("exist");
    H.runButtonOverlay().click();

    H.ensureParameterColumnValue({
      columnName: "STATE",
      columnValue: "NY",
    });
  });
});

describe("issue 13347", () => {
  beforeEach(() => {
    H.restore();
    H.restore("postgres-12");
    cy.signInAsAdmin();

    H.createQuestion({
      name: "13347 structured",
      database: WRITABLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
      },
    });

    H.createNativeQuestion({
      name: "13347 native",
      database: WRITABLE_DB_ID,
      native: {
        query: "SELECT * FROM ORDERS",
      },
    });

    cy.signInAsNormalUser();

    cy.visit("/");
  });

  it("should not display questions in mini data picker that cannot be used for new questions (metabase#13347)", () => {
    H.startNewQuestion();
    H.miniPickerOurAnalytics().click();

    H.miniPicker().within(() => {
      cy.findByText("Orders").should("exist");

      cy.findByText("13347 structured").should("not.exist");
      cy.findByText("13347 native").should("not.exist");
    });
  });

  it("should not display questions in big data picker that cannot be used for new questions (metabase#13347)", () => {
    H.startNewQuestion();
    H.miniPickerBrowseAll().click();

    H.entityPickerModalItem(1, "Sample Database").click();

    H.entityPickerModalLevel(2).within(() => {
      cy.findByText("Orders").should("exist");

      cy.findByText("13347 structured").should("not.exist");
      cy.findByText("13347 native").should("not.exist");
    });
  });
});

describe("issue #47005", () => {
  beforeEach(() => {
    H.restore();
    H.restore("postgres-12");
    cy.signInAsNormalUser();

    H.createQuestion({
      name: "Question A",
      query: {
        "source-table": ORDERS_ID,
      },
    }).then(({ body: question }) => {
      H.createQuestion(
        {
          name: "Question B",
          query: {
            "source-table": "card__" + question.id,
          },
        },
        { visitQuestion: true },
      );
    });
  });

  it("should show the collection of the base question in breadcrumbs (metabase#47005)", () => {
    cy.findAllByTestId("head-crumbs-container")
      .filter(":contains(Question A)")
      .findByText("Our analytics")
      .should("be.visible");
  });
});

describe("issue 66210", () => {
  const METRIC_NAME = "66210 metric";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion({
      name: METRIC_NAME,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      type: "metric",
    });

    cy.visit("/");
  });

  it("should not allow you to join on metrics", () => {
    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.entityPickerModalItem(0, "Our analytics").click();
    H.entityPickerModalItem(1, METRIC_NAME).should("be.visible");
    H.entityPickerModalItem(1, "Orders").click();
    H.join();
    H.miniPickerBrowseAll().click();
    H.entityPickerModalItem(0, "Our analytics").click();
    H.entityPickerModalLevel(1).findByText(METRIC_NAME).should("not.exist");
  });
});

describe("issue #67903", () => {
  beforeEach(() => {
    cy.viewport(1000, 800);
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show preview table headers on top of other elements (metabase#67903)", () => {
    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.pickEntity({ path: ["Databases", /Sample Database/, "Orders"] });
    H.getNotebookStep("data").findByTestId("step-preview-button").click();
    H.queryBuilderHeader().findByLabelText("View SQL").click();
    cy.findByTestId("table-header").should("not.be.visible");
  });
});

describe("issue 68574", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    const questionDetails: NativeQuestionDetails = {
      name: "Question 1",
      native: {
        query: "SELECT * FROM ORDERS WHERE CREATED_AT > {{ start }}",
        "template-tags": {
          start: {
            type: "date",
            name: "start",
            "display-name": "Start",
            id: "1",
          },
        },
      },
      parameters: [
        createMockParameter({
          id: "1",
          slug: "start",
          required: true,
          name: "Start",
          type: "date/single",
          target: ["variable", ["template-tag", "start"]],
        }),
      ],
    };

    H.createNativeQuestion(questionDetails, { wrapId: true });
  });

  it("should be possible to run a query for a empty required parameter without a default value (metabase#68574)", () => {
    updateFormattingSettings({
      date_style: "D MMMM, YYYY",
      date_abbreviate: false,
    });
    visitQuestion("2024-01-01");
    assertParameterFormat("1 January, 2024");

    cy.log("change the date format");
    updateFormattingSettings({
      date_style: "dddd, MMMM D, YYYY",
      date_abbreviate: false,
    });
    visitQuestion("2024-01-01");
    assertParameterFormat("Monday, January 1, 2024");

    cy.log("enable date abbreviation");
    updateFormattingSettings({
      date_style: "dddd, MMMM D, YYYY",
      date_abbreviate: true,
    });
    visitQuestion("2024-01-01");
    assertParameterFormat("Mon, Jan 1, 2024");

    cy.log("even when the setting is unset, it should render a valid format");
    updateFormattingSettings(undefined);
    visitQuestion("2024-01-01");
    assertParameterFormat("January 1, 2024");
  });

  function updateFormattingSettings(settings: any) {
    H.updateSetting("custom-formatting", {
      "type/Temporal": settings,
    });
  }

  function visitQuestion(value: string) {
    cy.get("@questionId").then((id) => {
      cy.visit(`/question/${id}?start=${value}`);
    });
  }

  function assertParameterFormat(value: string) {
    cy.findByTestId("parameter-value-widget-target")
      .should("be.visible")
      .should("contain.text", value);
  }
});
