import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  visitQuestion,
  cartesianChartCircle,
  visitQuestionAdhoc,
  sidebar,
  rightSidebar,
  leftSidebar,
  getDashboardCard,
  visitDashboard,
  openOrdersTable,
  getDraggableElements,
  moveDnDKitElement,
  openNativeEditor,
  runNativeQuery,
  main,
  createQuestion,
  openNotebook,
  getNotebookStep,
  queryBuilderHeader,
  modal,
  withDatabase,
  summarize,
  visualize,
  tableInteractive,
  createNativeQuestion,
} from "e2e/support/helpers";
import { createMetric as apiCreateMetric } from "e2e/support/helpers/e2e-table-metadata-helpers";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("issue 6010", () => {
  const createMetric = () => {
    return apiCreateMetric({
      name: "Metric",
      description: "Metric with a filter",
      table_id: ORDERS_ID,
      definition: {
        "source-table": ORDERS_ID,
        filter: [">", ORDERS.TOTAL, 150],
        aggregation: [["count"]],
      },
    });
  };

  const createQuestion = metric_id => {
    return cy.createQuestion({
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
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should apply the filter from a metric when drilling through (metabase#6010)", () => {
    createMetric()
      .then(({ body: { id } }) => createQuestion(id))
      .then(({ body: { id } }) => visitQuestion(id));

    cartesianChartCircle().eq(0).click();

    popover().findByText("See these Orders").click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Total is greater than 150").should("be.visible");
      cy.findByText("Created At is Jan 1–31, 2024").should("be.visible");
    });
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
    restore();
    cy.signInAsAdmin();
  });

  it("should not allow adding more series when all columns are used (metabase#11249)", () => {
    visitQuestionAdhoc(questionDetails);

    cy.findByTestId("viz-settings-button").click();

    cy.findByTestId("sidebar-left").within(() => {
      cy.findByText("Data").click();
      cy.findByText("Count").should("not.exist");

      cy.findByText("Add another series").click();
      cy.findByText("Count").should("be.visible");
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
    cartesianChartCircle().eq(index).realHover();
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should use time formatting settings in tooltips for native questions (metabase#11435)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
    hoverLineDot({ index: 1 });
    popover().findByTextEnsureVisible("March 11, 2025, 8:45:17.010 PM");
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

    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should be able to change field name used for values (metabase#15353)", () => {
    cy.findByTestId("viz-settings-button").click();
    sidebar()
      .contains("Count")
      .siblings("[data-testid$=settings-button]")
      .click();

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
    restore();
    cy.signInAsAdmin();
  });

  it("should display a pivot table as regular one when pivot columns are missing (metabase#18976)", () => {
    visitQuestionAdhoc(questionDetails);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 1 row");
  });

  it("should not keep orphan columns rendered after switching from pivot to regular table (metabase#18817)", () => {
    cy.createQuestion(
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

    cy.findByTestId("qb-header").button("Summarize").click();
    rightSidebar()
      .findByLabelText("Source")
      .findByRole("button", { name: "Remove dimension" })
      .click();

    cy.findAllByTestId("header-cell")
      .should("have.length", 2)
      .and("contain", "Name")
      .and("contain", "Count");
  });
});

describe("issue 18996", () => {
  const questionDetails = {
    name: "18996",
    native: {
      query: `
  select 1 "ID", 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg' "IMAGE", 123 "PRICE"
  union all select 2, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg', 123
  union all select 3, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg', 123
  union all select 4, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg', 123
  union all select 5, null, 123
  union all select 6, '', 123
  union all select 7, 'non-exisiting', 123
  union all select 8, null, 123
  union all select 9, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg', 123
  union all select 10, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg', 123
  `,
    },
    display: "table",
    visualization_settings: {
      "table.cell_column": "ID",
      "table.pivot_column": "PRICE",
      column_settings: {
        '["name","IMAGE"]': {
          view_as: "image",
        },
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should navigate between pages in a table with images in a dashboard (metabase#18996)", () => {
    cy.createNativeQuestionAndDashboard({
      questionDetails,
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    getDashboardCard().within(() => {
      cy.findByText(/Rows \d+-\d+ of 10/).should("be.visible");
      cy.icon("chevronright").click();
      cy.findByText(/Rows \d+-\d+ of 10/).should("be.visible");
    });
  });
});

describe.skip("issue 19373", () => {
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

    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questiondDetails, { visitQuestion: true });
  });

  it("should return correct sum of the distinct values in row totals (metabase#19373)", () => {
    // Convert to the pivot table manually to reflect the real-world scenario
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("Pivot Table-button").should("be.visible").click();
    cy.wait("@pivotDataset");

    cy.findAllByRole("grid").eq(0).as("columnTitles");
    cy.findAllByRole("grid").eq(1).as("rowTitles");
    cy.findAllByRole("grid").eq(2).as("tableCells");

    // Sanity check before we start asserting on this column
    cy.get("@columnTitles")
      .findAllByTestId("pivot-table-cell")
      .eq(ROW_TOTALS_INDEX)
      .should("contain", "Row totals");

    cy.get("@rowTitles")
      .findAllByTestId("pivot-table-cell")
      .eq(GRAND_TOTALS_INDEX)
      .should("contain", "Grand totals");

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
    restore();
    cy.signInAsAdmin();
  });

  it("should render a chart with many columns without freezing (metabase#21392)", () => {
    visitQuestionAdhoc({ dataset_query: TEST_QUERY, display: "line" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").should("be.visible");
  });
});

describe("#22206 adding and removing columns doesn't duplicate columns", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    openOrdersTable();

    cy.findByTestId("loading-spinner").should("not.exist");
  });

  it("should not duplicate column in settings when removing and adding it back", () => {
    cy.findByTestId("viz-settings-button").click();

    // remove column
    cy.findByTestId("sidebar-content")
      .findByText("Subtotal")
      .parent()
      .find(".Icon-eye_outline")
      .click();

    // rerun query
    cy.findAllByTestId("run-button").first().click();
    cy.wait("@dataset");
    cy.findByTestId("loading-spinner").should("not.exist");

    // add column back again
    cy.findByTestId("sidebar-content")
      .findByText("Subtotal")
      .parent()
      .find(".Icon-eye_crossed_out")
      .click();

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
        rows: [
          ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ["field", PEOPLE.ID, { "source-field": ORDERS.USER_ID }],
        ],
        columns: [],
        values: [["aggregation", 0]],
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/user/${ADMIN_USER_ID}`, {
      locale: "de",
    });

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should correctly translate dates (metabase#23076)", () => {
    cy.findAllByText(/^Summen für/)
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
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails);
  });

  it("table should should generate default columns when table.columns entries do not match data.cols (metabase#28304)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count by Created At: Month").should("be.visible");

    cy.findByTestId("viz-settings-button").click();
    leftSidebar().should("not.contain", "[Unknown]");
    leftSidebar().should("contain", "Created At");
    leftSidebar().should("contain", "Count");
    cy.findAllByTestId("mini-bar").should("have.length.greaterThan", 0);
    getDraggableElements().should("have.length", 2);
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
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails);
  });

  it("pivot table should show standalone values when collapsed to the sub-level grouping (metabase#25250)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID").should("be.visible");

    cy.findByTestId("viz-settings-button").click();
    moveDnDKitElement(getDraggableElements().contains("Product ID"), {
      vertical: -100,
    });
    getDraggableElements().eq(0).should("contain", "Product ID");
  });
});

describe("issue 30039", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not trigger object detail navigation after the modal was closed (metabase#30039)", () => {
    openNativeEditor().type("select * from ORDERS LIMIT 2");
    runNativeQuery();
    cy.findAllByTestId("detail-shortcut").first().click();
    cy.findByTestId("object-detail").should("be.visible");

    cy.realPress("{esc}");
    cy.findByTestId("object-detail").should("not.exist");

    cy.get("@editor").type("{downArrow};");
    runNativeQuery();
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
        rows: [
          [
            "field",
            ORDERS.TOTAL,
            {
              "base-type": "type/Float",
              binnig: {
                strategy: "num-bins",
                "min-value": 0,
                "max-value": 160,
                "num-bins": 8,
                "bin-width": 20,
              },
            },
          ],
        ],
        columns: [],
        values: [["aggregation", 0]],
      },
      "pivot_table.column_widths": {
        leftHeaderWidths: [80],
        totalLeftHeaderWidths: 80,
        valueHeaderWidths: { 0: 193 },
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not result in an error when you add a column after resizing an existing one (#37726)", () => {
    cy.intercept("POST", "/api/dataset/pivot").as("pivot");

    // The important data point in this question is that it has custom
    // leftHeaderWidths as if a user had dragged them to change the defaults.
    cy.createQuestion(PIVOT_QUESTION, { visitQuestion: true });

    // Now, add in another column to the pivot table
    cy.button("Summarize").click();

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
    main().within(() => {
      cy.findByText("Product → Category");
    });
  });
});

// unskip once metabase#42049 is addressed
describe.skip("issue 42049", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not mess up columns order (metabase#42049)", () => {
    cy.intercept("POST", "/api/card/*/query", req => {
      req.on("response", res => {
        const createdAt = res.body.data.cols[1];

        createdAt.field_ref[1] = "created_at"; // simulate named field ref

        res.send();
      });
    }).as("cardQuery");

    createQuestion(
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

    cy.findByRole("button", { name: "Filter" }).click();

    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: "Last month" }).click();
      cy.findByRole("button", { name: "Apply filters" }).click();
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
        rows: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "year" },
          ],
        ],
        columns: [
          [
            "field",
            PEOPLE.STATE,
            { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
          ],
        ],
        values: [
          ["aggregation", 0],
          ["aggregation", 1],
        ],
      },
      "pivot_table.column_widths": {
        leftHeaderWidths: [156],
        totalLeftHeaderWidths: 156,
        valueHeaderWidths: {},
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should display a pivot table when a new breakout is added to the query (metabase#42697)", () => {
    createQuestion(PIVOT_QUESTION, { visitQuestion: true });
    openNotebook();
    getNotebookStep("summarize")
      .findByTestId("breakout-step")
      .icon("add")
      .click();
    popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
    });
    queryBuilderHeader().findByText("Save").click();
    modal().button("Save").click();
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
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("postgres should display pivot tables (metabase#14148)", () => {
    withDatabase(PG_DB_ID, ({ PEOPLE, PEOPLE_ID }) =>
      visitQuestionAdhoc(
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
          callback: xhr =>
            expect(xhr.response.body.cause || "").not.to.contain("ERROR"),
        },
      ),
    );

    cy.log(
      "Reported failing on v0.38.0-rc1 querying Postgres, Redshift and BigQuery. It works on MySQL and H2.",
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Grand totals/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2,500");
  });
});

describe.skip("issue 25415", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow to drill-through aggregated query with a custom column on top level (metabase#25415)", () => {
    cy.createQuestion(
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

    popover().findByText("See these Orders").click();

    // filter gets applied
    cy.findByTestId("qb-filters-panel").should("contain", "Product ID is 1");

    // there is a table with data
    cy.findByTestId("TableInteractive-root").should("exist");
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

  const getNestedQuestionDetails = sourceQuestionId => ({
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
    restore();
    cy.signInAsNormalUser();
  });

  it("should not reset the column order after one of the columns is removed from data source (metabase#7884)", () => {
    createNativeQuestion(oldSourceQuestionDetails).then(
      ({ body: sourceQuestion }) =>
        createQuestion(getNestedQuestionDetails(sourceQuestion.id)).then(
          ({ body: nestedQuestion }) => {
            cy.request("PUT", `/api/card/${sourceQuestion.id}`, {
              ...sourceQuestion,
              dataset_query: {
                ...sourceQuestion.dataset_query,
                native: newSourceQuestionDetails.native,
              },
            });
            visitQuestion(nestedQuestion.id);
          },
        ),
    );

    cy.log("verify column order in the table");
    cy.findAllByTestId("header-cell").eq(0).should("contain.text", "C3");
    cy.findAllByTestId("header-cell").eq(1).should("contain.text", "C1");

    cy.log("verify column order in viz settings");
    cy.findByTestId("viz-settings-button").click();
    getDraggableElements().eq(0).should("contain.text", "C3");
    getDraggableElements().eq(1).should("contain.text", "C1");
  });
});

describe("issue 45481", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not crash when the table viz gets automatically pivoted (metabase#45481)", () => {
    openOrdersTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    popover().findByText("Count of rows").click();
    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    popover().findByText("User ID").click();
    getNotebookStep("summarize")
      .findByTestId("breakout-step")
      .icon("add")
      .click();
    popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
    });
    visualize();
    tableInteractive().should("be.visible");
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
    restore();
    cy.signInAsNormalUser();
  });

  it("should clear pivot settings when doing underlying records drill from a pivot table (metabase#12368)", () => {
    cy.log("drill thru from a pivot table");
    createQuestion(questionDetails, { visitQuestion: true });
    cy.findAllByTestId("cell-data").contains("1").first().click();
    popover().findByText("See this Product").click();

    cy.log("pivot flag should be cleared but other viz settings are preserved");
    tableInteractive().within(() => {
      cy.findByText("Ean").should("be.visible");
      cy.findByText("Vendor2").should("be.visible");
    });
    cy.findByTestId("viz-settings-button").click();
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
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${PRODUCTS.CATEGORY}`, {
      visibility_type: "details-only",
    });
  });

  it("should honor visibility_type of the field when the question has viz settings (metabase#32718)", () => {
    createQuestion(questionDetails, { visitQuestion: true });
    tableInteractive().within(() => {
      cy.findByText("ID").should("be.visible");
      cy.findByText("Ean").should("not.exist");
      cy.findByText("Category").should("not.exist");
      cy.findByText("Created At").should("be.visible");
    });
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("Detail-button").click();
    cy.findByTestId("object-detail").within(() => {
      cy.findByText("ID").should("be.visible");
      cy.findByText("Ean").should("not.exist");
      cy.findByText("Category").should("be.visible");
      cy.findByText("Created At").should("be.visible");
    });
  });
});
