import {
  signInAsAdmin,
  withSampleDataset,
  restore,
  popover,
} from "__support__/cypress";

describe("scenarios > question > nested (metabase#12568)", () => {
  before(() => {
    restore();
    signInAsAdmin();

    // Create a simple question of orders by week
    withSampleDataset(({ ORDERS }) => {
      cy.request("POST", "/api/card", {
        name: "GH_12568: Simple",
        dataset_query: {
          database: 1,
          query: {
            "source-table": 2,
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
    withSampleDataset(({ ORDERS, PRODUCTS }) => {
      cy.request("POST", "/api/card", {
        name: "10511",
        dataset_query: {
          database: 1,
          query: {
            filter: [">", ["field-literal", "count", "type/Integer"], 5],
            "source-query": {
              "source-table": 2,
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
  });

  it.skip("should display granularity for aggregated fields in nested questions (metabase#13764)", () => {
    cy.visit("/question/new?database=1&table=2&mode=notebook");
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
});
