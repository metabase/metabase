const { H } = cy;
import { chunk } from "underscore";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("issue 6010", () => {
  const createMetric = () => {
    return H.createQuestion({
      name: "Metric",
      description: "Metric with a filter",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        filter: [">", ORDERS.TOTAL, 150],
        aggregation: [["count"]],
      },
    });
  };

  const createQuestion = (metric_id) => {
    return H.createQuestion({
      name: "Question",
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        aggregation: [["metric", metric_id]],
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
      },
    });
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should apply the filter from a metric when drilling through (metabase#6010)", () => {
    createMetric()
      .then(({ body: { id } }) => createQuestion(id))
      .then(({ body: { id } }) => H.visitQuestion(id));

    // Metric filters are transformed into aggregation case expression condition. The 21st point is first non filtered
    // point.
    H.cartesianChartCircle().eq(21).click();

    H.popover().findByText("See these Orders").click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Created At: Month is Jan 1–31, 2024").should("be.visible");
    });
    // FIXME metrics v2 -- check that the values in column Total are above 150
  });
});

describe("issue 11249", () => {
  const questionDetails = {
    name: "13960",
    display: "line",
    dataset_query: {
      type: "query",
      database: 1,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["avg"],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not allow adding more series when all columns are used (metabase#11249)", () => {
    H.visitQuestionAdhoc(questionDetails);

    H.openVizSettingsSidebar();

    cy.findByTestId("sidebar-left").within(() => {
      cy.findByText("Data").click();
      cy.findByDisplayValue("Count").should("not.exist");

      cy.findByText("Add another series").click();
      cy.findByDisplayValue("Count").should("be.visible");
      cy.findByText("Add another series").should("not.exist");
    });
  });
});

describe("issue 11435", () => {
  const questionDetails = {
    name: "11435",
    display: "line",
    native: {
      query: `
  SELECT "PUBLIC"."ORDERS"."ID" AS "ID", "PUBLIC"."ORDERS"."USER_ID" AS "USER_ID", "PUBLIC"."ORDERS"."PRODUCT_ID" AS "PRODUCT_ID", "PUBLIC"."ORDERS"."SUBTOTAL" AS "SUBTOTAL", "PUBLIC"."ORDERS"."TAX" AS "TAX", "PUBLIC"."ORDERS"."TOTAL" AS "TOTAL", "PUBLIC"."ORDERS"."DISCOUNT" AS "DISCOUNT", "PUBLIC"."ORDERS"."CREATED_AT" AS "CREATED_AT", "PUBLIC"."ORDERS"."QUANTITY" AS "QUANTITY"
  FROM "PUBLIC"."ORDERS"
  WHERE ("PUBLIC"."ORDERS"."CREATED_AT" >= timestamp with time zone '2025-03-12 00:00:00.000+03:00'
         AND "PUBLIC"."ORDERS"."CREATED_AT" < timestamp with time zone '2025-03-13 00:00:00.000+03:00')
  LIMIT 1048575`,
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["TOTAL"],
      column_settings: {
        '["name","CREATED_AT"]': {
          time_enabled: "milliseconds",
        },
      },
    },
  };
  const hoverLineDot = ({ index } = {}) => {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.cartesianChartCircle().eq(index).realHover();
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should use time formatting settings in tooltips for native questions (metabase#11435)", () => {
    H.createNativeQuestion(questionDetails, { visitQuestion: true });
    hoverLineDot({ index: 1 });
    H.assertEChartsTooltip({
      header: "March 11, 2025, 8:45:17.010 PM",
      rows: [
        {
          color: "#F9D45C",
          name: "TOTAL",
          value: "25.03",
        },
      ],
    });
  });
});

describe("issue 15353", () => {
  const questionDetails = {
    name: "15353",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
    },
    display: "pivot",
  };

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset/pivot").as("pivotDataset");

    H.restore();
    cy.signInAsAdmin();

    H.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should be able to change field name used for values (metabase#15353)", () => {
    H.openVizSettingsSidebar();
    H.sidebar()
      .findByTestId("draggable-item-Count")
      .icon("ellipsis")
      .click({ force: true });

    cy.findByDisplayValue("Count").type(" renamed").blur();

    cy.wait("@pivotDataset");

    cy.findByTestId("query-visualization-root").should(
      "contain",
      "Count renamed",
    );
  });
});

describe("issue 18976, 18817", () => {
  const questionDetails = {
    display: "table",
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "native",
      native: {
        query: "select 'a', 'b'",
        "template-tags": {},
      },
    },
    visualization_settings: {
      "table.pivot": true,
      "table.pivot_column": "'a'",
      "table.cell_column": "1",
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should display a pivot table as regular one when pivot columns are missing (metabase#18976)", () => {
    H.visitQuestionAdhoc(questionDetails);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 1 row");
  });

  it("should not keep orphan columns rendered after switching from pivot to regular table (metabase#18817)", () => {
    H.createQuestion(
      {
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PEOPLE.NAME],
            ["field", PEOPLE.SOURCE],
          ],
          limit: 5,
        },
        database: SAMPLE_DB_ID,
        display: "table",
      },
      { visitQuestion: true },
    );

    cy.findByTestId("qb-header")
      .button(/Summarize/)
      .click();
    H.rightSidebar()
      .findByLabelText("Source")
      .findByRole("button", { name: "Remove dimension" })
      .click();

    cy.findAllByTestId("header-cell")
      .should("have.length", 2)
      .and("contain", "Name")
      .and("contain", "Count");
  });
});

describe("issue 19373", { tags: "@skip" }, () => {
  const questiondDetails = {
    name: "Products, Distinct values of Rating, Grouped by Category and Created At (year)",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["distinct", ["field", PRODUCTS.RATING, null]]],
      breakout: [
        ["field", PRODUCTS.CATEGORY, null],
        ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
      ],
    },
  };

  const ROW_TOTALS_INDEX = 4;
  const GRAND_TOTALS_INDEX = 4;

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset/pivot").as("pivotDataset");

    H.restore();
    cy.signInAsAdmin();

    H.createQuestion(questiondDetails, { visitQuestion: true });
  });

  it("should return correct sum of the distinct values in row totals (metabase#19373)", () => {
    // Convert to the pivot table manually to reflect the real-world scenario
    H.openVizTypeSidebar();
    cy.findByTestId("Pivot Table-button").should("be.visible").click();
    cy.wait("@pivotDataset");

    cy.findAllByRole("grid").eq(0).as("columnTitles");
    cy.findAllByRole("grid").eq(1).as("rowTitles");
    cy.findAllByRole("grid").eq(2).as("tableCells");

    // Sanity check before we start asserting on this column
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.get("@columnTitles")
      .findAllByTestId("pivot-table-cell")
      .eq(ROW_TOTALS_INDEX)
      .should("contain", "Row totals");

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.get("@rowTitles")
      .findAllByTestId("pivot-table-cell")
      .eq(GRAND_TOTALS_INDEX)
      .should("contain", "Grand totals");

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.get("@tableCells")
      .findAllByTestId("pivot-table-cell")
      .eq(ROW_TOTALS_INDEX)
      .should("contain", "31");
  });
});

describe("issue 21392", () => {
  const TEST_QUERY = {
    type: "native",
    native: {
      query: `
  WITH
     L0   AS (SELECT c FROM (SELECT 1 UNION ALL SELECT 1) AS D(c)) -- 2^1
    ,L1   AS (SELECT 1 AS c FROM L0 AS A CROSS JOIN L0 AS B)       -- 2^2
    ,L2   AS (SELECT 1 AS c FROM L1 AS A CROSS JOIN L1 AS B)       -- 2^4
    ,L3   AS (SELECT 1 AS c FROM L2 AS A CROSS JOIN L0 AS B)       -- 2^5

  SELECT ROWNUM() id, DATEADD('DAY', ROWNUM(), CURRENT_DATE)::DATE date,
  RAND() c00, RAND() c01, RAND() c02, RAND() c03, RAND() c04, RAND() c05, RAND() c06, RAND() c07, RAND() c08, RAND() c09,
  RAND() c10, RAND() c11, RAND() c12, RAND() c13, RAND() c14, RAND() c15, RAND() c16, RAND() c17, RAND() c18, RAND() c19,
  RAND() c20, RAND() c21, RAND() c22, RAND() c23, RAND() c24, RAND() c25, RAND() c26, RAND() c27, RAND() c28, RAND() c29,
  RAND() c30, RAND() c31
  FROM L3
      `,
    },
    database: SAMPLE_DB_ID,
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should render a chart with many columns without freezing (metabase#21392)", () => {
    H.visitQuestionAdhoc({ dataset_query: TEST_QUERY, display: "line" });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").should("be.visible");
  });
});

describe("#22206 adding and removing columns doesn't duplicate columns", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable();

    cy.findByTestId("loading-indicator").should("not.exist");
  });

  it("should not duplicate column in settings when removing and adding it back", () => {
    H.openVizSettingsSidebar();

    // remove column
    cy.findByTestId("sidebar-content")
      .findByTestId("draggable-item-Subtotal")
      .icon("eye_outline")
      .click({ force: true });

    // rerun query
    cy.findAllByTestId("run-button").first().click();
    cy.wait("@dataset");
    cy.findByTestId("loading-indicator").should("not.exist");

    // add column back again
    cy.findByTestId("sidebar-content")
      .findByTestId("draggable-item-Subtotal")
      .icon("eye_crossed_out")
      .click({ force: true });

    // fails because there are 2 columns, when there should be one
    cy.findByTestId("sidebar-content").findByText("Subtotal");

    // if you add it back again it crashes the question
  });
});

describe("issue 23076", () => {
  const questionDetails = {
    name: "Orders, Distinct values of ID, Grouped by Product → Title and Created At (month) and User → ID",

    query: {
      "source-table": ORDERS_ID,
      aggregation: [["distinct", ["field", ORDERS.ID, null]]],
      breakout: [
        ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", PEOPLE.ID, { "source-field": ORDERS.USER_ID }],
      ],
    },
    display: "pivot",
    visualization_settings: {
      "pivot_table.column_split": {
        rows: ["TITLE", "CREATED_AT", "ID"],
        columns: [],
        values: ["distinct"],
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/user/${ADMIN_USER_ID}`, {
      locale: "de",
    });

    H.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should correctly translate dates (metabase#23076)", () => {
    cy.findAllByText(/^Summen für/, { timeout: 10000 })
      .should("be.visible")
      .eq(1)
      .invoke("text")
      .should("eq", "Summen für Mai 2023");
  });
});

describe("issue 28304", () => {
  const questionDetails = {
    name: "28304",
    dataset_query: {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      database: SAMPLE_DB_ID,
    },
    display: "table",
    visualization_settings: {
      "table.columns": [
        {
          fieldRef: ["field", ORDERS.ID, null],
          enabled: true,
        },
        {
          fieldRef: ["field", ORDERS.USER_ID, null],
          enabled: true,
        },
        {
          fieldRef: ["field", ORDERS.PRODUCT_ID, null],
          enabled: true,
        },
        {
          fieldRef: ["field", ORDERS.SUBTOTAL, null],
          enabled: true,
        },
        {
          fieldRef: ["field", ORDERS.TAX, null],
          enabled: true,
        },
        {
          fieldRef: ["field", ORDERS.DISCOUNT, null],
          enabled: true,
        },
      ],
      column_settings: {
        '["name","count"]': { show_mini_bar: true },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.visitQuestionAdhoc(questionDetails);
  });

  it("table should should generate default columns when table.columns entries do not match data.cols (metabase#28304)", () => {
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count by Created At: Month").should("be.visible");

    H.openVizSettingsSidebar();
    H.leftSidebar().should("not.contain", "[Unknown]");
    H.leftSidebar().should("contain", "Created At");
    H.leftSidebar().should("contain", "Count");
    cy.findAllByTestId("mini-bar-container").should(
      "have.length.greaterThan",
      0,
    );
    H.getDraggableElements().should("have.length", 2);
  });
});

describe("issue 25250", () => {
  const questionDetails = {
    name: "28311",
    dataset_query: {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
      },
      database: SAMPLE_DB_ID,
    },
    display: "table",
    visualization_settings: {
      "table.columns": [
        {
          fieldRef: ["field", ORDERS.ID, null],
          enabled: true,
        },
        {
          fieldRef: ["field", ORDERS.USER_ID, null],
          enabled: true,
        },
        {
          fieldRef: ["field", ORDERS.PRODUCT_ID, null],
          enabled: true,
        },
        {
          fieldRef: ["field", ORDERS.SUBTOTAL, null],
          enabled: false,
        },
        {
          fieldRef: ["field", ORDERS.TAX, null],
          enabled: false,
        },
        {
          fieldRef: ["field", ORDERS.DISCOUNT, null],
          enabled: false,
        },
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.visitQuestionAdhoc(questionDetails);
  });

  it("pivot table should show standalone values when collapsed to the sub-level grouping (metabase#25250)", () => {
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID").should("be.visible");

    H.openVizSettingsSidebar();
    H.getDraggableElements().contains("Product ID").as("dragElement");
    H.moveDnDKitElementByAlias("@dragElement", {
      vertical: -100,
    });
    H.getDraggableElements().eq(0).should("contain", "Product ID");
  });
});

describe("issue 30039", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not trigger object detail navigation after the modal was closed (metabase#30039)", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from ORDERS LIMIT 2");
    H.runNativeQuery();
    cy.findAllByTestId("detail-shortcut").first().click({ force: true });
    cy.findByTestId("object-detail").should("be.visible");

    cy.realPress("{esc}");
    cy.findByTestId("object-detail").should("not.exist");

    H.NativeEditor.type("{downArrow};");
    H.runNativeQuery();
    cy.findByTestId("object-detail").should("not.exist");
  });
});

describe("issue 37726", () => {
  const PIVOT_QUESTION = {
    name: "Pivot table with custom column width",
    display: "pivot",
    query: {
      "source-table": ORDERS_ID,
      breakout: [
        [
          "field",
          ORDERS.TOTAL,
          { "base-type": "type/Float", binnig: { strategy: "default" } },
        ],
      ],
      aggregation: [
        ["distinct", ["field", ORDERS.ID, { "base-type": "type/BigInteger" }]],
      ],
    },
    visualization_settings: {
      "pivot_table.column_split": {
        rows: ["TOTAL"],
        columns: [],
        values: ["distinct"],
      },
      "pivot_table.column_widths": {
        leftHeaderWidths: [80],
        totalLeftHeaderWidths: 80,
        valueHeaderWidths: { 0: 193 },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not result in an error when you add a column after resizing an existing one (#37726)", () => {
    cy.intercept("POST", "/api/dataset/pivot").as("pivot");

    // The important data point in this question is that it has custom
    // leftHeaderWidths as if a user had dragged them to change the defaults.
    H.createQuestion(PIVOT_QUESTION, { visitQuestion: true });

    // Now, add in another column to the pivot table
    cy.button(/Summarize/).click();

    cy.findByRole("listitem", { name: "Category" })
      .realHover()
      .button("Add dimension")
      .click();

    // Wait for the pivot call to return
    cy.wait("@pivot");

    // Refresh the page -- this loads the question using the transient value
    cy.reload();

    // Look for the new column name in the resulting pivot table.
    // Note that before this fix, the page would error out and this elements,
    // along with the rest of the pivot table, would not appear.
    // Instead, you got a nice ⚠️ icon and a "Something's gone wrong" tooltip.
    H.main().within(() => {
      cy.findByText("Product → Category", { timeout: 8000 });
    });
  });
});

describe("issue 42049", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not mess up columns order (metabase#42049)", () => {
    cy.intercept("POST", "/api/card/*/query", (req) => {
      req.on("response", (res) => {
        const createdAt = res.body.data.cols[1];

        createdAt.field_ref[1] = "created_at"; // simulate named field ref

        res.send();
      });
    }).as("cardQuery");

    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          fields: [
            ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
            ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
            ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
          ],
        },
        visualization_settings: {
          "table.columns": [
            {
              name: "ID",
              fieldRef: ["field", ORDERS.ID, null],
              enabled: true,
            },
            {
              name: "CREATED_AT",
              fieldRef: [
                "field",
                ORDERS.CREATED_AT,
                {
                  "temporal-unit": "default",
                },
              ],
              enabled: true,
            },
            {
              name: "QUANTITY",
              fieldRef: ["field", ORDERS.QUANTITY, null],
              enabled: true,
            },
          ],
        },
      },
      { visitQuestion: true },
    );

    cy.log("verify initial columns order");

    cy.findAllByTestId("header-cell").as("headerCells");
    cy.get("@headerCells").eq(0).should("have.text", "ID");
    cy.get("@headerCells").eq(1).should("have.text", "Created At");
    cy.get("@headerCells").eq(2).should("have.text", "Quantity");

    cy.findByTestId("question-filter-header").click();

    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.button("Previous month").click();
    });

    cy.wait("@cardQuery");
    cy.get("@cardQuery.all").should("have.length", 2);

    cy.log("verify columns order after applying the filter");

    cy.findAllByTestId("header-cell").as("headerCells");
    cy.get("@headerCells").eq(0).should("have.text", "ID");
    cy.get("@headerCells").eq(1).should("have.text", "Created At");
    cy.get("@headerCells").eq(2).should("have.text", "Quantity");
  });
});

describe("issue 42697", () => {
  const PIVOT_QUESTION = {
    display: "pivot",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count"],
        ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ],
      breakout: [
        [
          "field",
          PEOPLE.STATE,
          { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
        ],
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "year" },
        ],
      ],
    },
    visualization_settings: {
      "pivot_table.column_split": {
        rows: ["CREATED_AT"],
        columns: ["STATE"],
        values: ["count", "sum"],
      },
      "pivot_table.column_widths": {
        leftHeaderWidths: [156],
        totalLeftHeaderWidths: 156,
        valueHeaderWidths: {},
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should display a pivot table when a new breakout is added to the query (metabase#42697)", () => {
    H.createQuestion(PIVOT_QUESTION, { visitQuestion: true });
    H.openNotebook();
    H.getNotebookStep("summarize")
      .findByTestId("breakout-step")
      .icon("add")
      .click();
    H.popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
    });
    H.queryBuilderHeader().findByText("Save").click();
    H.modal().button("Save").click();
    cy.wait("@updateCard");
    cy.button("Visualize").click();
    cy.findByTestId("pivot-table")
      .findByText("Product → Category")
      .should("be.visible");
  });
});

describe("issue 14148", { tags: "@external" }, () => {
  const PG_DB_ID = 2;

  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("postgres should display pivot tables (metabase#14148)", () => {
    H.withDatabase(PG_DB_ID, ({ PEOPLE, PEOPLE_ID }) =>
      H.visitQuestionAdhoc(
        {
          display: "pivot",
          dataset_query: {
            type: "query",
            database: PG_DB_ID,
            query: {
              "source-table": PEOPLE_ID,
              aggregation: [["count"]],
              breakout: [
                ["field", PEOPLE.SOURCE, null],
                ["field", PEOPLE.CREATED_AT, { "temporal-unit": "year" }],
              ],
            },
          },
        },
        {
          callback: (xhr) =>
            expect(xhr.response.body.cause || "").not.to.contain("ERROR"),
        },
      ),
    );

    cy.log(
      "Reported failing on v0.38.0-rc1 querying Postgres, Redshift and BigQuery. It works on MySQL and H2.",
    );

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Grand totals/i);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2,500");
  });
});

describe("issue 25415", { tags: "@skip" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow to drill-through aggregated query with a custom column on top level (metabase#25415)", () => {
    H.createQuestion(
      {
        name: "Aggregated query with custom column",
        display: "line",
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.PRODUCT_ID, null]],
            limit: 2,
          },
          expressions: {
            "test custom": [
              "*",
              [
                "field",
                "count",
                {
                  "base-type": "type/Integer",
                },
              ],
              2,
            ],
          },
        },
      },
      { visitQuestion: true },
    );

    cy.get(".dc-tooltip-list").get(".dot").first().click({ force: true });

    H.popover().findByText("See these Orders").click();

    // filter gets applied
    cy.findByTestId("qb-filters-panel").should("contain", "Product ID is 1");

    // there is a table with data
    H.tableInteractive().should("exist");
  });
});

describe("issue 7884", () => {
  const oldSourceQuestionDetails = {
    native: {
      query: "SELECT 1 AS C1, 2 AS C2, 3 AS C3",
    },
  };

  const newSourceQuestionDetails = {
    native: {
      query: "SELECT 1 AS C1, 3 AS C3",
    },
  };

  const getNestedQuestionDetails = (sourceQuestionId) => ({
    query: {
      "source-table": `card__${sourceQuestionId}`,
    },
    display: "table",
    visualization_settings: {
      "table.columns": [
        { name: "C3", enabled: true },
        { name: "C1", enabled: true },
        { name: "C2", enabled: true },
      ],
    },
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not reset the column order after one of the columns is removed from data source (metabase#7884)", () => {
    H.createNativeQuestion(oldSourceQuestionDetails).then(
      ({ body: sourceQuestion }) =>
        H.createQuestion(getNestedQuestionDetails(sourceQuestion.id)).then(
          ({ body: nestedQuestion }) => {
            cy.request("PUT", `/api/card/${sourceQuestion.id}`, {
              ...sourceQuestion,
              dataset_query: {
                type: "native",
                database: SAMPLE_DB_ID,
                native: newSourceQuestionDetails.native,
              },
            });
            H.visitQuestion(nestedQuestion.id);
          },
        ),
    );

    cy.log("verify column order in the table");
    cy.findAllByTestId("header-cell").eq(0).should("contain.text", "C3");
    cy.findAllByTestId("header-cell").eq(1).should("contain.text", "C1");

    cy.log("verify column order in viz settings");
    H.openVizSettingsSidebar();
    H.getDraggableElements().eq(0).should("contain.text", "C3");
    H.getDraggableElements().eq(1).should("contain.text", "C1");
  });
});

describe("issue 45481", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not crash when the table viz gets automatically pivoted (metabase#45481)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.popover().findByText("Count of rows").click();
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().findByText("User ID").click();
    H.getNotebookStep("summarize")
      .findByTestId("breakout-step")
      .icon("add")
      .click();
    H.popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
    });
    H.visualize();
    H.tableInteractive().should("be.visible");
  });
});

describe("issue 12368", () => {
  const questionDetails = {
    type: "question",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.VENDOR, { "base-type": "type/Text" }],
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      ],
    },
    visualization_settings: {
      "table.pivot": true,
      "table.pivot_column": "CATEGORY",
      "table.cell_column": "count",
      column_settings: {
        [`["ref",["field",${PRODUCTS.VENDOR},null]]`]: {
          column_title: "Vendor2",
        },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should clear pivot settings when doing underlying records drill from a pivot table (metabase#12368)", () => {
    cy.log("drill thru from a pivot table");
    H.createQuestion(questionDetails, { visitQuestion: true });
    cy.findAllByTestId("cell-data").contains("1").first().click();
    H.popover().findByText("See this Product").click();

    cy.log("pivot flag should be cleared but other viz settings are preserved");
    H.tableInteractive().within(() => {
      cy.findByText("Ean").should("be.visible");
      cy.findByText("Vendor2").should("be.visible");
    });
    H.openVizSettingsSidebar();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.button("Add or remove columns").should("be.visible");
      cy.findByText("Pivot column").should("not.exist");
      cy.findByText("Cell column").should("not.exist");
    });
  });
});

describe("issue 32718", () => {
  const questionDetails = {
    display: "table",
    query: {
      "source-table": PRODUCTS_ID,
      fields: [
        ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }],
        ["field", PRODUCTS.EAN, { "base-type": "type/Text" }],
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        ["field", PRODUCTS.CREATED_AT, { "base-type": "type/DateTime" }],
      ],
      limit: 1,
    },
    visualization_settings: {
      "table.columns": [
        { name: "ID", enabled: true },
        { name: "EAN", enabled: false },
        { name: "CATEGORY", enabled: true },
        { name: "CREATED_AT", enabled: true },
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${PRODUCTS.CATEGORY}`, {
      visibility_type: "details-only",
    });
  });

  it("should honor visibility_type of the field when the question has viz settings (metabase#32718)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.tableInteractive().within(() => {
      cy.findByText("ID").should("be.visible");
      cy.findByText("Ean").should("not.exist");
      cy.findByText("Category").should("not.exist");
      cy.findByText("Created At").should("be.visible");
    });
    H.openVizTypeSidebar();
    cy.findByTestId("Detail-button").click();
    cy.findByTestId("object-detail").within(() => {
      cy.findByText("ID").should("be.visible");
      cy.findByText("Ean").should("not.exist");
      cy.findByText("Category").should("be.visible");
      cy.findByText("Created At").should("be.visible");
    });
  });
});

describe("issue 50346", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count"],
        ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ],
      breakout: [
        [
          "field",
          PRODUCTS.CATEGORY,
          { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
        ],
        [
          "field",
          PRODUCTS.VENDOR,
          { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
        ],
        [
          "field",
          PEOPLE.SOURCE,
          { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
        ],
      ],
    },
    display: "pivot",
    visualization_settings: {
      "pivot_table.column_split": {
        // mix field refs with and without `base-type` to make sure we support both cases
        rows: [
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          [
            "field",
            PRODUCTS.VENDOR,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
          [
            "field",
            PEOPLE.SOURCE,
            { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
          ],
        ],
        columns: [],
        values: [
          ["aggregation", 0],
          ["aggregation", 1],
        ],
      },
      "pivot_table.column_widths": {
        leftHeaderWidths: [150, 214, 120],
        totalLeftHeaderWidths: 484,
        valueHeaderWidths: {},
      },
    },
  };

  const groupValue = "Annetta Wyman and Sons";
  const totalValue = "1,217.76";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should be able to collapse rows for questions with legacy pivot settings (metabase#50346)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true, wrapId: true });

    cy.log("collapse one of the sections");
    cy.findByTestId("pivot-table").within(() => {
      cy.findByText(totalValue).should("be.visible");
      cy.findByTestId(`${groupValue}-toggle-button`).click();
      cy.findByText(totalValue).should("not.exist");
    });

    cy.log("save and make sure the setting is preserved on reload");
    H.queryBuilderHeader().button("Save").click();
    H.modal().button("Save").click();
    cy.wait("@updateCard");
    H.visitQuestion("@questionId");
    cy.findByTestId("pivot-table").within(() => {
      cy.findByText(totalValue).should("not.exist");
    });

    cy.log("expand the section");
    cy.findByTestId("pivot-table").within(() => {
      cy.findByTestId(`${groupValue}-toggle-button`).click();
      cy.findByText(totalValue).should("be.visible");
    });
  });
});

describe("issue 50686", () => {
  const questionDetails = {
    name: "50686",
    display: "smartscalar",
    native: {
      query:
        "select 100 as total, 110 as forecast, 80 as last_year, now() as now",
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow selecting more than 1 comparison (metabase#50686)", () => {
    H.createNativeQuestion(questionDetails, { visitQuestion: true });
    // Default comparison
    H.queryBuilderMain().findByText("N/A");

    // Add another comparison
    H.openVizSettingsSidebar();
    cy.button("Add comparison").click();
    H.popover().findByText("Value from another column…").click();
    H.popover().findByText("FORECAST").click();
    H.popover().button("Done").click();

    H.queryBuilderMain().within(() => {
      // First comparison still exists
      cy.findByText("N/A");

      // New comparison has been added
      cy.findByText("9.09%");
      cy.contains("vs. FORECAST");
    });
  });
});

describe("issue 52339", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow mapping pivot table dashcard fields to click behavior targets (metabase#52339)", () => {
    const questionDetails = {
      name: "Orders, Distinct values of ID, Grouped by Product → Title and Created At (month) and User → ID",

      query: {
        "source-table": ORDERS_ID,
        aggregation: [["distinct", ["field", ORDERS.ID, null]]],
        breakout: [
          ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
          ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
        ],
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["TITLE", "SOURCE"],
          columns: [],
          values: ["distinct"],
        },
      },
    };

    const sourceParam = {
      name: "Source",
      slug: "filter-text",
      id: "1b9cd9f1",
      type: "string/=",
      sectionId: "string",
    };

    H.createQuestionAndDashboard({
      dashboardDetails: {
        parameters: [sourceParam],
      },
      questionDetails,
      cardDetails: {
        size_x: 16,
        size_y: 8,
      },
    }).then(({ body: { id, card_id, dashboard_id }, questionId }) => {
      cy.wrap(questionId).as("questionId");

      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 16,
            size_y: 8,
            series: [],
            visualization_settings: {},
            parameter_mappings: [
              {
                parameter_id: sourceParam.id,
                card_id,
                target: [
                  "dimension",
                  [
                    "field",
                    PEOPLE.SOURCE,
                    {
                      "source-field": ORDERS.USER_ID,
                    },
                  ],
                ],
              },
            ],
          },
        ],
      });

      H.visitDashboard(dashboard_id);
    });

    H.editDashboard();
    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Click behavior")
      .click();

    H.sidebar().within(() => {
      cy.findByText("Go to a custom destination").click();
      cy.findByText("Dashboard").click();
    });

    H.modal().findByText("Test Dashboard").click();

    cy.findByTestId("click-mappings").findByText("Source").click();

    H.popover().within(() => {
      cy.findByText("Product → Title");
      cy.findByText("User → Source");
      cy.findByText("Distinct values of ID");
    });
  });
});

describe("issue 56771", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should apply correct column widths after changing query (metabase#56771)", () => {
    H.openOrdersTable();
    cy.log(
      "Resize a column first to make width stored in the visualization settings",
    );
    H.resizeTableColumn("ID", 100);

    H.openNotebook();
    H.join();
    H.joinTable("Products");
    H.visualize();

    cy.wait(100); // wait for the column to be resized

    cy.findAllByTestId("header-cell")
      .filter(":contains(Products → Category)")
      .as("headerCell")
      .then(($cell) => {
        const width = $cell[0].getBoundingClientRect().width;
        expect(width).to.be.greaterThan(160);
      });
  });
});

describe("issue 57132", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset", function (req) {
      req.continue((res) => {
        // remove description from the CATEGORY column
        const index = res.body.data.cols.findIndex(
          (col) => col.name === "CATEGORY",
        );
        delete res.body.data.cols[index].description;
      });
    });
  });

  it("should render more values when hovering colum header without description (metabase#57132)", () => {
    H.openProductsTable();
    H.tableInteractive().findByText("Category").realHover();

    cy.log("The popover should be wide enough to show at least some values");
    H.popover()
      .findByText(/^Doohickey, Gadget, Gizmo/)
      .should("be.visible");
  });
});

describe("issue 52333", () => {
  const baseQuery = `
SELECT *
FROM (
  SELECT
    category,
    source,
    state,
    SUM(orders.discount) AS discount,
    SUM(orders.total) AS total,
    SUM(orders.quantity) AS quantity
  FROM
    orders
    LEFT JOIN products ON orders.product_id = products.id
    LEFT JOIN people ON orders.user_id = people.id
  GROUP BY category, source, state
) AS filtered_orders
WHERE NOT (
  category = 'Gizmo'
  AND (
    source IN ('Facebook', 'Google', 'Organic', 'Twitter')
    OR state NOT IN ('AK')
  )
);`;

  const baseQuestionDetails = {
    name: "52333",
    display: "table",
    native: {
      query: baseQuery,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("pivot table should show subtotals for a group of a single value (metabase#52333)", () => {
    H.createNativeQuestion(baseQuestionDetails, {
      visitQuestion: true,
      wrapId: true,
    });

    cy.get("@questionId").then((id) => {
      const questionDetails = {
        query: {
          "source-table": `card__${id}`,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              "CATEGORY",
              {
                "base-type": "type/Text",
              },
            ],
            [
              "field",
              "SOURCE",
              {
                "base-type": "type/Text",
              },
            ],
            [
              "field",
              "STATE",
              {
                "base-type": "type/Text",
              },
            ],
          ],
        },
        display: "pivot",
        visualization_settings: {
          "pivot_table.column_split": {
            rows: ["CATEGORY", "SOURCE", "STATE"],
            columns: [],
            values: ["count", "avg"],
          },
          "pivot_table.column_widths": {
            leftHeaderWidths: [104, 92, 80],
            totalLeftHeaderWidths: 276,
            valueHeaderWidths: {},
          },
          "pivot_table.collapsed_rows": {
            value: ['["Doohickey"]', '["Gadget"]', '["Widget"]'],
            rows: ["CATEGORY", "SOURCE", "STATE"],
          },
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });
    });

    H.queryBuilderMain().within(() => {
      cy.findByText("Affiliate");
      cy.findByText("AK");

      // Ensure it does not show subtotals for the single value by default
      cy.findByText("Totals for Affiliate").should("not.exist");

      H.openVizSettingsSidebar();
    });

    H.sidebar().findByText("Condense duplicate totals").click();

    // Ensure it shows subtotals for the single value
    H.queryBuilderMain()
      .findByText("Totals for Affiliate")
      .should("be.visible");
  });
});

describe("issue 55673", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable();
  });

  it("should be able to close a header popover using Escape (metabase#55673)", () => {
    H.tableHeaderClick("Product ID");
    cy.findByTestId("click-actions-view").should("be.visible");

    cy.focused().should(
      "have.attr",
      "data-testid",
      "click-actions-sort-control-sort.ascending",
    );
    cy.realPress(["Escape"]);
    cy.findByTestId("click-actions-view").should("not.exist");
  });
});

describe("issue 55637", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show column metadata popovers when header cell is clicked (metabase#55637)", () => {
    H.openOrdersTable();
    H.tableHeaderColumn("ID").realHover();
    cy.findByTestId("column-info").should("exist");

    H.tableHeaderColumn("ID").click();

    H.tableHeaderColumn("ID").realHover();
    cy.findByTestId("column-info").should("not.exist");

    H.tableHeaderColumn("Tax").realHover();
    cy.findByTestId("column-info").should("not.exist");
  });
});

describe("issue 63745", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should display correct data when toggling columns (metabase#63745)", () => {
    H.visitQuestionAdhoc({
      name: "63745",
      display: "object",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
      },
    });

    H.openVizSettingsSidebar();
    cy.findByTestId("chartsettings-sidebar")
      .button("Add or remove columns")
      .click();

    cy.findAllByTestId("object-details-table-cell").should(($cells) => {
      const cellsFlat = $cells.toArray().map((el) => el.textContent);
      const map = new Map(chunk(cellsFlat, 2));
      expect(map.get("User ID")).to.eq("1");
    });

    cy.findByTestId("orders-table-columns").findByLabelText("ID").click();

    cy.findAllByTestId("object-details-table-cell").should(($cells) => {
      const cellsFlat = $cells.toArray().map((el) => el.textContent);
      const map = new Map(chunk(cellsFlat, 2));
      expect(map.get("User ID")).to.eq("1");
    });
  });
});

describe("issue 56094", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow to switch between automatic pivot table and usual table visualization (metabase#56094)", () => {
    H.visitQuestionAdhoc({
      name: "56094",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              PRODUCTS.CATEGORY,
              {
                "base-type": "type/Text",
              },
            ],
            [
              "field",
              PRODUCTS.RATING,
              {
                binning: {
                  strategy: "default",
                },
              },
            ],
          ],

          limit: 20,
        },
      },
    });

    H.queryBuilderFooter().findByLabelText("Switch to data").click();

    H.queryBuilderFooterDisplayToggle().should("exist");

    H.queryBuilderFooter().findByLabelText("Switch to visualization").click();

    H.queryBuilderFooterDisplayToggle().should("exist");
  });
});
