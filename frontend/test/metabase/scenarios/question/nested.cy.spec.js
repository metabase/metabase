import {
  signInAsAdmin,
  restore,
  popover,
  createNativeQuestion,
  openOrdersTable,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATASET;

describe("scenarios > question > nested (metabase#12568)", () => {
  before(() => {
    restore();
    signInAsAdmin();

    // Create a simple question of orders by week
    cy.request("POST", "/api/card", {
      name: "GH_12568: Simple",
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "week"],
          ],
        },
        type: "query",
      },
      display: "line",
      visualization_settings: {},
    });

    // Create a native question of orders by day
    cy.request("POST", "/api/card", {
      name: "GH_12568: SQL",
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT date_trunc('day', CREATED_AT) as date, COUNT(*) as count FROM ORDERS GROUP BY date_trunc('day', CREATED_AT)",
        },
        database: 1,
      },
      display: "scalar",
      description: null,
      visualization_settings: {},
      collection_id: null,
      result_metadata: null,
      metadata_checksum: null,
    });

    // Create a complex native question
    cy.request("POST", "/api/card", {
      name: "GH_12568: Complex SQL",
      dataset_query: {
        type: "native",
        native: {
          query: `WITH tmp_user_order_dates as (
              SELECT 
                o.USER_ID,
                o.CREATED_AT,
                o.QUANTITY
              FROM 
                ORDERS o
            ),
            
            tmp_prior_orders_by_date as (
              select
                  tbod.USER_ID,
                  tbod.CREATED_AT,
                  tbod.QUANTITY,
                  (select count(*) from tmp_user_order_dates tbod2 where tbod2.USER_ID = tbod.USER_ID and tbod2.CREATED_AT < tbod.CREATED_AT ) as PRIOR_ORDERS
              from tmp_user_order_dates tbod
            )
            
            select
              date_trunc('day', tpobd.CREATED_AT) as "Date",
              case when tpobd.PRIOR_ORDERS > 0 then 'Return' else 'New' end as "Customer Type",
              sum(QUANTITY) as "Items Sold"
            from tmp_prior_orders_by_date tpobd
            group by date_trunc('day', tpobd.CREATED_AT), "Customer Type"
            order by date_trunc('day', tpobd.CREATED_AT) asc`,
        },
        database: 1,
      },
      display: "scalar",
      description: null,
      visualization_settings: {},
      collection_id: null,
      result_metadata: null,
      metadata_checksum: null,
    });
  });

  beforeEach(signInAsAdmin);

  it("should allow Distribution on a Saved Simple Question", () => {
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("Saved Questions").click();
    cy.contains("GH_12568: Simple").click();
    cy.contains("Count").click();
    cy.contains("Distribution").click();
    cy.contains("Count by Count: Auto binned");
    cy.get(".bar").should("have.length.of.at.least", 10);
  });

  it("should allow Sum over time on a Saved Simple Question", () => {
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("Saved Questions").click();
    cy.contains("GH_12568: Simple").click();
    cy.contains("Count").click();
    cy.contains("Sum over time").click();
    cy.contains("Sum of Count");
    cy.get(".dot").should("have.length.of.at.least", 10);
  });

  it("should allow Distribution on a Saved SQL Question", () => {
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("Saved Questions").click();
    cy.contains("GH_12568: SQL").click();
    cy.contains("COUNT").click();
    cy.contains("Distribution").click();
    cy.contains("Count by COUNT: Auto binned");
    cy.get(".bar").should("have.length.of.at.least", 10);
  });

  it("should allow Sum over time on a Saved SQL Question", () => {
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("Saved Questions").click();
    cy.contains("GH_12568: SQL").click();
    cy.contains("COUNT").click();
    cy.contains("Sum over time").click();
    cy.contains("Sum of COUNT");
    cy.get(".dot").should("have.length.of.at.least", 10);
  });

  it("should allow Distribution on a Saved complex SQL Question", () => {
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("Saved Questions").click();
    cy.contains("GH_12568: Complex SQL").click();
    cy.contains("Items Sold").click();
    cy.contains("Distribution").click();
    cy.contains("Count by Items Sold: Auto binned");
    cy.get(".bar").should("have.length.of.at.least", 10);
  });
});

describe("scenarios > question > nested", () => {
  before(() => {
    restore();
    signInAsAdmin();
  });

  it("should handle duplicate column names in nested queries (metabase#10511)", () => {
    cy.request("POST", "/api/card", {
      name: "10511",
      dataset_query: {
        database: 1,
        query: {
          filter: [">", ["field-literal", "count", "type/Integer"], 5],
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
              [
                "datetime-field",
                [
                  "fk->",
                  ["field-id", ORDERS.PRODUCT_ID],
                  ["field-id", PRODUCTS.CREATED_AT],
                ],
                "month",
              ],
            ],
          },
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body: { id: questionId } }) => {
      cy.visit(`/question/${questionId}`);
      cy.findByText("10511");
      cy.findAllByText("June, 2016");
      cy.findAllByText("13");
    });
  });

  it.skip("should display granularity for aggregated fields in nested questions (metabase#13764)", () => {
    openOrdersTable({ mode: "notebook" });
    // add initial aggregation ("Average of Total by Order ID")
    cy.findByText("Summarize").click();
    cy.findByText("Average of ...").click();
    cy.findByText("Total").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("ID").click();
    // add another aggregation ("Count by Average of Total")
    cy.get(".Button")
      .contains("Summarize")
      .click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.log("**Reported failing on v0.34.3 - v0.37.0.2**");
    popover()
      .contains("Average of Total")
      .closest(".List-item")
      .contains("Auto binned");
  });

  it.skip("should show all filter options for a nested question (metabase#13186)", () => {
    cy.log("**-- 1. Create and save native question Q1 --**");

    createNativeQuestion("13816_Q1", "SELECT * FROM PRODUCTS").then(
      ({ body: { id: Q1_ID } }) => {
        cy.log("**-- 2. Convert it to `query` and save as Q2 --**");

        cy.request("POST", "/api/card", {
          name: "13816_Q2",
          dataset_query: {
            database: 1,
            query: {
              "source-table": `card__${Q1_ID}`,
            },
            type: "query",
          },
          display: "table",
          visualization_settings: {},
        });
      },
    );

    cy.log("**-- 3. Create a brand new dashboard --**");

    cy.request("POST", "/api/dashboard", {
      name: "13186D",
    }).then(({ body: { id: DASBOARD_ID } }) => {
      cy.visit(`/dashboard/${DASBOARD_ID}`);
    });

    // Add Q2 to that dashboard
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-add")
      .last()
      .click();
    cy.findByText("13816_Q2").click();

    // Add filter to the dashboard...
    cy.get(".Icon-filter").click();
    cy.findByText("Other Categories").click();
    // ...and try to connect it to the question
    cy.findByText("Select…").click();

    cy.log("**Reported failing in v0.36.4 (`Category` is missing)**");
    popover().within(() => {
      cy.findByText(/Category/i);
      cy.findByText(/Title/i);
      cy.findByText(/Vendor/i);
    });
  });

  it.skip("should apply metrics including filter to the nested question (metabase#12507)", () => {
    const METRIC_NAME = "Discount Applied";

    cy.log("**-- 1. Create a metric with a filter --**");

    cy.request("POST", "/api/metric", {
      name: METRIC_NAME,
      description: "Discounted orders.",
      definition: {
        aggregation: [["count"]],
        filter: ["not-null", ["field-id", ORDERS.DISCOUNT]],
        "source-table": ORDERS_ID,
      },
      table_id: ORDERS_ID,
    }).then(({ body: { id: METRIC_ID } }) => {
      // "capture" the original query because we will need to re-use it later in a nested question as "source-query"
      const ORIGINAL_QUERY = {
        aggregation: ["metric", METRIC_ID],
        breakout: [["binning-strategy", ["field-id", ORDERS.TOTAL], "default"]],
        "source-table": ORDERS_ID,
      };

      cy.log(
        "**-- 2. Create new question which uses previously defined metric --**",
      );

      cy.request("POST", "/api/card", {
        name: "Orders with discount applied",
        dataset_query: {
          database: 1,
          query: ORIGINAL_QUERY,
          type: "query",
        },
        display: "bar",
        visualization_settings: {
          "graph.dimension": ["TOTAL"],
          "graph.metrics": [METRIC_NAME],
        },
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.server();
        cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

        cy.log(
          "**-- 3. Create a nested question based on the previous one --**",
        );

        // we're adding filter and saving/overwriting the original question, keeping the same ID
        cy.request("PUT", `/api/card/${QUESTION_ID}`, {
          dataset_query: {
            database: 1,
            query: {
              filter: [">", ["field-literal", "TOTAL", "type/Float"], 50],
              "source-query": ORIGINAL_QUERY,
            },
            type: "query",
          },
        });

        cy.log("**Reported failing since v0.35.2**");
        cy.visit(`/question/${QUESTION_ID}`);
        cy.wait("@cardQuery").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });
        cy.findByText(METRIC_NAME);
        cy.get(".bar");
      });
    });
  });
});
