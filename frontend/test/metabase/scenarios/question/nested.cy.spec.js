import { signInAsAdmin, restore } from "__support__/cypress";

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
          "source-table": 2,
          aggregation: [["count"]],
          breakout: [["datetime-field", ["field-id", 15], "week"]],
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
