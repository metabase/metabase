const { H } = cy;
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NO_COLLECTION_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("issue 32964", () => {
  const LONG_NAME = "A very long column name that will cause text overflow";

  const QUESTION = {
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          [LONG_NAME]: [
            "*",
            ["field", SAMPLE_DATABASE.ORDERS.SUBTOTAL, null],
            2,
          ],
        },
        aggregation: [["sum", ["expression", LONG_NAME]]],
        breakout: [
          [
            "field",
            SAMPLE_DATABASE.ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "week",
            },
          ],
        ],
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not overflow chart settings sidebar with long column name (metabase#32964)", () => {
    H.visitQuestionAdhoc(QUESTION);
    H.openVizSettingsSidebar();
    cy.findByTestId("sidebar-left").within(([sidebar]) => {
      const maxX = sidebar.getBoundingClientRect().right;
      cy.findByDisplayValue(`Sum of ${LONG_NAME}`).then(([el]) => {
        const x = el.getBoundingClientRect().right;
        expect(x).to.be.lessThan(maxX);
      });
    });
  });
});

describe("issue 33079", () => {
  const questionDetails: StructuredQuestionDetails = {
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.request("GET", "/api/user/current").then(({ body: user }) => {
      cy.request("PUT", `/api/user/${user.id}`, { locale: "de" });
    });
  });

  it("underlying records drill should work in a non-English locale (metabase#33079)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.cartesianChartCircle().eq(1).click({ force: true });
    H.popover()
      .findByText("Siehe diese Einträge") // See these records
      .click();
    cy.wait("@dataset");
    cy.findByTestId("question-row-count").should("contain", "19");
  });
});

describe("issue 34414", () => {
  const PRODUCTS_MODEL_DETAILS: StructuredQuestionDetails = {
    name: "Products Model",
    query: { "source-table": PRODUCTS_ID },
    type: "model",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("populate field values after re-adding filter on model field (metabase#34414)", () => {
    H.createQuestion(PRODUCTS_MODEL_DETAILS).then((response) => {
      const modelId = response.body.id;

      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: { "source-table": `card__${modelId}` },
        },
      });
    });

    H.openNotebook();
    H.filter({ mode: "notebook" });

    H.popover().within(() => {
      cy.findByText("Category").click();
      assertCategoryFieldValues();

      cy.log("Open filter again");
      cy.findByLabelText("Back").click();

      cy.log("Open category field again");
      cy.findByText("Category").click();

      assertCategoryFieldValues();
    });
  });
});

function assertCategoryFieldValues() {
  cy.findByText("Doohickey").should("be.visible");
  cy.findByText("Gadget").should("be.visible");
  cy.findByText("Gizmo").should("be.visible");
  cy.findByText("Widget").should("be.visible");
}

describe("issue 38354", { tags: "@external" }, () => {
  const QUESTION_DETAILS = {
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
    },
  };

  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
    H.createQuestion(QUESTION_DETAILS, { visitQuestion: true });
  });

  it("should be possible to change source database (metabase#38354)", () => {
    H.openNotebook();
    H.getNotebookStep("data").findByTestId("data-step-cell").click();
    H.miniPicker().within(() => {
      H.miniPickerHeader().click();
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
    });

    // optimization: add a limit so that query runs faster
    cy.button("Row limit").click();
    H.getNotebookStep("limit").findByPlaceholderText("Enter a limit").type("5");

    H.visualize();

    cy.findByTestId("query-builder-main")
      .findByText("There was a problem with your question")
      .should("not.exist");
    cy.get("[data-testid=cell-data]").should("contain", "37.65"); // assert visualization renders the data
  });
});

describe("issue 39102", () => {
  const questionDetails: StructuredQuestionDetails = {
    name: "39102",
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        aggregation: ["count"],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 1000],
      aggregation: ["count"],
    },
    type: "question",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to preview a multi-stage query (metabase#39102)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();

    H.getNotebookStep("data", { stage: 0 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Tax").should("be.visible");
      cy.icon("close").click();
    });

    H.getNotebookStep("summarize", { stage: 0 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("3,610").should("be.visible");
      cy.findByText("744").should("be.visible");
      cy.icon("close").click();
    });

    H.getNotebookStep("filter", { stage: 1 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("3,610").should("be.visible");
      cy.findByText("744").should("not.exist");
      cy.icon("close").click();
    });

    H.getNotebookStep("summarize", { stage: 1 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("4").should("be.visible");
    });
  });
});

describe("issue 13814", () => {
  const questionDetails: StructuredQuestionDetails = {
    display: "scalar",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count", ["field", ORDERS.TAX, { "base-type": "type/Float" }]],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should support specifying a field in 'count' MBQL clause even if the UI doesn't support it (metabase#13814)", () => {
    cy.log("verify that the API supports saving this MBQL");
    H.createQuestion(questionDetails).then(({ body: card }) =>
      H.visitQuestion(card.id),
    );

    cy.log("verify that the query is executed correctly");
    cy.findByTestId("scalar-value").findByText("18,760").should("be.visible");

    cy.log(
      "verify that the clause is displayed correctly and won't crash if updated",
    );
    H.openNotebook();
    H.getNotebookStep("summarize")
      .findByText("Count of Tax")
      .should("be.visible")
      .click();
    H.popover().findByText("Count of rows").click();
    H.getNotebookStep("summarize").findByText("Count").should("be.visible");
  });
});

describe("issue 40176", () => {
  const DIALECT = "postgres";
  const TABLE = "uuid_pk_table";

  beforeEach(() => {
    H.restore(`${DIALECT}-writable`);
    cy.signInAsAdmin();
    H.resetTestTable({ type: DIALECT, table: TABLE });
    H.resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: TABLE,
    });
  });

  it(
    "should allow filtering on UUID PK columns (metabase#40176)",
    { tags: "@external" },
    () => {
      H.getTable({ name: TABLE }).then(({ id: tableId }) => {
        H.visitQuestionAdhoc({
          display: "table",
          dataset_query: {
            database: WRITABLE_DB_ID,
            query: {
              "source-table": tableId,
            },
            type: "query",
          },
        });
      });
      H.openNotebook();
      cy.findByTestId("action-buttons").findByText("Filter").click();
      H.popover().within(() => {
        cy.findByText("ID").click();
        cy.findByLabelText("Filter value").type(
          "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        );
        cy.button("Add filter").click();
      });
      H.visualize();
      cy.findByTestId("question-row-count")
        .findByText("Showing 1 row")
        .should("be.visible");
    },
  );
});

describe(
  "issue 42010 -- Unable to filter by mongo id",
  { tags: "@mongo" },
  () => {
    beforeEach(() => {
      H.restore("mongo-5");
      cy.signInAsAdmin();

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.request(`/api/database/${WRITABLE_DB_ID}/schema/`).then(({ body }) => {
        const tableId = body.find(
          (table: { id: number; name: string }) => table.name === "orders",
        ).id;
        H.openTable({
          database: WRITABLE_DB_ID,
          table: tableId,
          limit: 2,
        });
      });
      cy.wait("@dataset");
    });

    it("should be possible to filter by Mongo _id column (metabase#40770, metabase#42010)", () => {
      H.tableInteractiveBody()
        .findByTestId("center-center-quadrant")
        .findAllByRole("gridcell")
        .first()
        .then(($cell) => {
          // Ids are non-deterministic so we have to obtain the id from the cell, and store its value.
          const id = $cell.text();

          cy.log(
            "Scenario 1 - Make sure the simple mode filter is working correctly (metabase#40770)",
          );
          H.filter();
          H.popover().within(() => {
            cy.findAllByText("ID").should("have.length", 2).first().click();
            cy.findByLabelText("Filter value").type(id).click();
            cy.button("Apply filter").click();
          });
          H.assertQueryBuilderRowCount(1);
          removeFilter();

          cy.log(
            "Scenario 2 - Make sure filter is working in the notebook editor (metabase#42010)",
          );
          H.openNotebook();
          H.filter({ mode: "notebook" });

          H.popover()
            .findAllByRole("option")
            .first()
            .should("have.text", "ID")
            .click();

          cy.findByTestId("string-filter-picker").within(() => {
            cy.findByLabelText("Filter operator").should("have.text", "Is");
            cy.findByLabelText("Filter value").type(id);
            cy.button("Add filter").click();
          });

          cy.findByTestId("step-filter-0-0").within(() => {
            cy.findByText(`ID is ${id}`);

            cy.log(
              "Scenario 2.1 - Trigger the preview to make sure it reflects the filter correctly",
            );
            cy.icon("play").click();
          });

          // The preview should show only one row
          const ordersColumns = 10;
          cy.findByTestId("preview-root")
            .findByTestId("table-body")
            .findAllByTestId("cell-data")
            .should("have.length.at.most", ordersColumns);

          cy.log("Scenario 2.2 - Make sure we can visualize the data");
          H.visualize();
          cy.findByTestId("question-row-count").should(
            "have.text",
            "Showing 1 row",
          );
        });
    });
  },
);

function removeFilter() {
  cy.findByTestId("filter-pill").findByLabelText("Remove").click();
  cy.findByTestId("question-row-count").should("have.text", "Showing 2 rows");
}

describe("issue 42244", () => {
  const COLUMN_NAME = "Created At".repeat(5);

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      display_name: COLUMN_NAME,
    });
  });

  it("should allow to change the temporal bucket when the column name is long (metabase#42244)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().within(() => {
      cy.findByText(COLUMN_NAME).realHover();
      cy.findByText("by month").should("be.visible").click();
    });
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover().last().findByText("Year").click();
    H.getNotebookStep("summarize")
      .findByText(`${COLUMN_NAME}: Year`)
      .should("be.visible");
  });
});

describe("issue 44071", () => {
  const questionDetails = {
    name: "Test",
    query: { "source-table": ORDERS_ID },
    collection_id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
  };

  beforeEach(() => {
    H.restore();
    cy.signIn("nocollection");
    H.createQuestion(questionDetails);
  });

  it("should be able to save questions based on another questions without collection access (metabase#44071)", () => {
    cy.visit("/");
    H.newButton("Question").click();
    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      cy.findByText(/Personal Collection/).click();
      cy.findByText(questionDetails.name).click();
    });
    H.getNotebookStep("data")
      .findByText(questionDetails.name)
      .should("be.visible");
    H.saveQuestion();
    H.appBar()
      .findByText(/Personal Collection/)
      .should("be.visible");
  });
});

describe("issue 44415", () => {
  // the `fieldRef` key is how older versions stored column settings
  const LEGACY_TABLE_COLUMNS = [
    {
      name: "ID",
      fieldRef: ["field", ORDERS.ID, null],
      enabled: true,
    },
    {
      name: "DISCOUNT",
      fieldRef: ["field", ORDERS.DISCOUNT, null],
      enabled: true,
    },
  ];

  beforeEach(() => {
    H.restore();
    cy.signIn("admin");
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          filter: [
            "and",
            [
              "not-null",
              ["field", ORDERS.DISCOUNT, { "base-type": "type/Float" }],
            ],
          ],
        },
        visualization_settings: {
          "table.columns": LEGACY_TABLE_COLUMNS,
        },
      },
      { wrapId: true },
    );
  });

  it("should be able to edit a table question in the notebook editor before running its query (metabase#44415)", () => {
    cy.get("@questionId").then((questionId) =>
      cy.visit(`/question/${questionId}/notebook`),
    );

    H.getNotebookStep("filter")
      .findAllByTestId("notebook-cell-item")
      .first()
      .icon("close")
      .click();

    H.getNotebookStep("filter").should("not.exist");

    H.visualize();

    cy.findByTestId("qb-filters-panel").should("not.exist");
    cy.get("@questionId").then((questionId) => {
      cy.url().should("not.include", `/question/${questionId}`);
      cy.url().should("include", "question#");
    });
  });
});

describe("issue 37374", () => {
  const questionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        ["field", PRODUCTS.VENDOR, { "base-type": "type/Text" }],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(questionDetails, { wrapId: true });
    cy.signIn("nodata");
  });

  it("should allow to change the viz type to pivot without data access (metabase#37374)", () => {
    H.visitQuestion("@questionId");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/card/pivot/*/query").as("cardPivotQuery");

    cy.log("changing the viz type to pivot table and running the query works");
    H.openVizTypeSidebar();
    cy.findByTestId("chart-type-sidebar")
      .findByTestId("Pivot Table-button")
      .click();
    cy.wait("@cardPivotQuery");
    cy.findByTestId("pivot-table").should("be.visible");

    cy.log("changing the viz type back to table and running the query works");
    cy.findByTestId("chart-type-sidebar").findByTestId("Table-button").click();
    cy.wait("@cardQuery");
    H.tableInteractive().should("be.visible");
  });
});

describe("issue 31960", () => {
  const questionDetails: StructuredQuestionDetails = {
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
    },
    display: "line",
    visualization_settings: {
      "graph.metrics": ["count"],
      "graph.dimensions": ["CREATED_AT"],
    },
  };

  // the dot that corresponds to July 13–19, 2025
  const dotIndex = 10;
  const rowCount = 11;

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should apply a date range filter for a query broken out by week (metabase#31960)", () => {
    H.createDashboardWithQuestions({ questions: [questionDetails] }).then(
      ({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      },
    );

    H.getDashboardCard().within(() => {
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.cartesianChartCircle().eq(dotIndex).realHover();
    });
    H.assertEChartsTooltip({
      header: "July 13–19, 2025", // expect this to break when we shift years in the Sample Database
      rows: [{ name: "Count", value: String(rowCount), secondaryValue: "0%" }],
    });
    H.getDashboardCard().within(() => {
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.cartesianChartCircle().eq(dotIndex).click({ force: true });
    });

    H.popover().findByText("See these Orders").click();
    cy.findByTestId("qb-filters-panel")
      .findByText("Created At: Week is Jul 13–19, 2025")
      .should("be.visible");
    H.assertQueryBuilderRowCount(rowCount);
  });
});

describe("issue 40399", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show results from other stages in a stages preview (metabase#40399)", () => {
    H.createQuestion(
      {
        name: "40399",
        query: {
          "source-table": PRODUCTS_ID,
          joins: [
            {
              fields: "all",
              alias: "Orders",
              "source-table": ORDERS_ID,
              strategy: "left-join",
              condition: [
                "=",
                ["field", PRODUCTS.ID, null],
                ["field", ORDERS.PRODUCT_ID, { "join-alias": "Orders" }],
              ],
            },
          ],
          filter: ["=", ["field", PRODUCTS.CATEGORY, null], "Widget"],
        },
      },
      {
        visitQuestion: true,
      },
    );

    H.openNotebook();

    H.getNotebookStep("filter", { stage: 0 }).within(() => {
      cy.icon("play").click();
      cy.findByTestId("preview-root")
        .findAllByText("Widget")
        .should("be.visible");
    });

    H.getNotebookStep("join", { stage: 0 }).within(() => {
      cy.icon("play").click();
      cy.findByTestId("preview-root")
        .findAllByText("Gizmo")
        .should("be.visible");

      cy.findByTestId("preview-root").findByText("Widget").should("not.exist");
    });

    H.getNotebookStep("data", { stage: 0 }).within(() => {
      cy.icon("play").click();
      cy.findByTestId("preview-root")
        .findAllByText("Gizmo")
        .should("be.visible");

      cy.findByTestId("preview-root").findAllByText("Gizmo").should("exist");
      cy.findByTestId("preview-root").findAllByText("Widget").should("exist");
    });
  });
});
