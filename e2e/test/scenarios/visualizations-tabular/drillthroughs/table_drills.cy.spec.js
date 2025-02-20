const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  ACCOUNTS_ID,
} = SAMPLE_DATABASE;

describe("scenarios > visualizations > drillthroughs > table_drills", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.viewport(1500, 800);
  });

  it("should display proper drills on cell click for unaggregated query", () => {
    H.openReviewsTable({ limit: 3 });

    // FK cell drills
    cy.get(".test-Table-FK").findByText("1").first().click();
    H.popover().within(() => {
      cy.findByText("View this Product's Reviews").should("be.visible");
      cy.findByText("View details").should("be.visible");
    });

    // Short text cell drills
    cy.get("[data-testid=cell-data]").contains("christ").click();
    H.popover().within(() => {
      cy.findByText("Is christ").should("be.visible");
      cy.findByText("Is not christ").should("be.visible");
      cy.findByText("View details").should("be.visible");
    });

    // Number cell drills
    cy.get("[data-testid=cell-data]").contains("5").first().click();
    H.popover().within(() => {
      cy.findByText(">").should("be.visible");
      cy.findByText("<").should("be.visible");
      cy.findByText("=").should("be.visible");
      cy.findByText("≠").should("be.visible");
      cy.findByText("View details").should("be.visible");
    });

    cy.get("[data-testid=cell-data]").contains("Ad perspiciatis quis").click();
    H.popover().within(() => {
      cy.findByText("Contains…").should("be.visible");
      cy.findByText("Does not contain…").should("be.visible");
      cy.findByText("View details").should("be.visible");
    });

    cy.get("[data-testid=cell-data]").contains("May 15, 20").click();
    H.popover().within(() => {
      cy.findByText("Before").should("be.visible");
      cy.findByText("After").should("be.visible");
      cy.findByText("On").should("be.visible");
      cy.findByText("Not on").should("be.visible");
      cy.findByText("View details").should("be.visible");
    });

    H.tableHeaderClick("ID");
    cy.findByTestId("click-actions-popover-content-for-ID").within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText("Filter by this column").should("be.visible");
      cy.findByText("Distinct values").should("be.visible");
    });

    H.tableHeaderClick("Reviewer");
    cy.findByTestId("click-actions-popover-content-for-Reviewer").within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText("Filter by this column").should("be.visible");
      cy.findByText("Distribution").should("be.visible");
      cy.findByText("Distinct values").should("be.visible");
    });

    H.tableHeaderClick("Rating");
    cy.findByTestId("click-actions-popover-content-for-Rating").within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText("Filter by this column").should("be.visible");
      cy.findByText("Sum over time").should("be.visible");
      cy.findByText("Distribution").should("be.visible");

      cy.findByText("Sum").should("be.visible");
      cy.findByText("Avg").should("be.visible");
      cy.findByText("Distinct values").should("be.visible");
    });
  });

  it("should display proper drills on cell click for query aggregated by category", () => {
    H.createQuestion(
      {
        query: {
          "source-table": REVIEWS_ID,
          aggregation: [["count"]],
          breakout: [["field", REVIEWS.REVIEWER, null]],
          limit: 10,
        },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("TableInteractive-root")
      .findByText("abbey-heidenreich")
      .click();

    H.popover().within(() => {
      cy.findByText("Is abbey-heidenreich").should("be.visible");
      cy.findByText("Is not abbey-heidenreich").should("be.visible");
    });

    cy.get("[data-testid=cell-data]").contains("1").first().click();
    H.popover().within(() => {
      cy.findByText("See this Review").should("be.visible");

      cy.findByText("Automatic insights…").should("be.visible");

      cy.findByText(">").should("be.visible");
      cy.findByText("<").should("be.visible");
      cy.findByText("=").should("be.visible");
      cy.findByText("≠").should("be.visible");
    });

    H.tableHeaderClick("Reviewer");
    cy.findByTestId("click-actions-popover-content-for-Reviewer").within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText("Filter by this column").should("be.visible");
    });

    H.tableHeaderClick("Count");
    cy.findByTestId("click-actions-popover-content-for-Count").within(() => {
      cy.icon("arrow_down").should("be.visible");
      cy.icon("arrow_up").should("be.visible");
      cy.icon("gear").should("be.visible");

      cy.findByText("Filter by this column").should("be.visible");
    });
  });

  it("should display proper drills on cell click for query aggregated by date", () => {
    H.createQuestion(
      {
        query: {
          "source-table": REVIEWS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", REVIEWS.CREATED_AT, { "temporal-unit": "month" }],
          ],
          limit: 10,
        },
      },
      { visitQuestion: true },
    );

    cy.get("[data-testid=cell-data]").contains("June").first().click();
    H.popover().within(() => {
      cy.findByText("Before").should("be.visible");
      cy.findByText("After").should("be.visible");
      cy.findByText("On").should("be.visible");
      cy.findByText("Not on").should("be.visible");
    });

    cy.get("[data-testid=cell-data]").contains("4").first().click();
    H.popover().within(() => {
      cy.findByText("See this month by week").should("be.visible");

      cy.findByText("Break out by…").should("be.visible");
      cy.findByText("Automatic insights…").should("be.visible");

      cy.findByText(">").should("be.visible");
      cy.findByText("<").should("be.visible");
      cy.findByText("=").should("be.visible");
      cy.findByText("≠").should("be.visible");
    });

    cy.findByTestId("timeseries-chrome").within(() => {
      cy.findByText("View").should("be.visible");
      cy.findByText("All time").should("be.visible");
      cy.findByText("by").should("be.visible");
      cy.findByText("Month").should("be.visible");
    });
  });

  describe("pivot drill", () => {
    const queryWithJoin = {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
      joins: [
        {
          alias: "Products",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          fields: "all",
          "source-table": PRODUCTS_ID,
        },
      ],
    };
    const queryWithJoinThenFilter = {
      "source-query": queryWithJoin,
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
    };

    function pivotDrillTest({
      query,
      drillCellText,
      menuItems,
      filterText,
      resultText,
    }) {
      H.visitQuestionAdhoc({
        name: "pivot drill query",
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: query,
          type: "query",
        },
        display: "table",
      });
      cy.get("[data-testid=cell-data]").contains(drillCellText).first().click();
      H.popover().within(() => {
        cy.findByText("Break out by…").click();
        menuItems.forEach(item => {
          cy.findByText(item).click();
        });
      });
      cy.findAllByTestId("filter-pill").first().should("have.text", filterText);
      cy.get("[data-testid=cell-data]")
        .contains(resultText)
        .should("be.visible");
    }

    it("should allow category pivot drills on single-stage queries (metabase#52236)", () => {
      pivotDrillTest({
        query: queryWithJoin,
        drillCellText: "4,939",
        menuItems: ["Category", "Vendor"],
        filterText: "Products → Category is Gadget",
        resultText: "Barrows-Johns",
      });
    });

    it("should allow category pivot drills on multi-stage queries (metabase#52236)", () => {
      pivotDrillTest({
        query: queryWithJoinThenFilter,
        drillCellText: "4,939",
        menuItems: ["Category", "Vendor"],
        filterText: "Products → Category is Gadget",
        resultText: "Barrows-Johns",
      });
    });

    it("should allow timeseries pivot drills on single-stage queries (metabase#52236)", () => {
      pivotDrillTest({
        query: queryWithJoin,
        drillCellText: "3,976",
        menuItems: ["Time", "Products", "Created At"],
        filterText: "Products → Category is Doohickey",
        resultText: "July 31, 2022",
      });
    });

    it("should allow timeseries pivot drills on multi-stage queries (metabase#52236)", () => {
      pivotDrillTest({
        query: queryWithJoinThenFilter,
        drillCellText: "3,976",
        menuItems: ["Time", "Products", "Created At"],
        filterText: "Products → Category is Doohickey",
        resultText: "July 31, 2022",
      });
    });
  });

  describe("native query", () => {
    it("should display proper drills on cell click for unaggregated query", () => {
      H.createNativeQuestion(
        {
          name: "table_drills",
          native: { query: "select * from reviews limit 3" },
        },
        { visitQuestion: true },
      );

      // FK cell drills
      cy.get("[data-testid=cell-data]").filter(":contains(1)").eq(1).click();
      H.popover().within(() => {
        cy.findByText("Filter by this value").should("be.visible");
      });

      // Short text cell drills
      cy.get("[data-testid=cell-data]").contains("christ").click();
      H.popover().within(() => {
        cy.findByText("Is christ").should("be.visible");
        cy.findByText("Is not christ").should("be.visible");
      });

      // Number cell drills
      cy.get("[data-testid=cell-data]").contains("5").first().click();
      H.popover().within(() => {
        cy.findByText(">").should("be.visible");
        cy.findByText("<").should("be.visible");
        cy.findByText("=").should("be.visible");
        cy.findByText("≠").should("be.visible");
      });

      cy.get("[data-testid=cell-data]")
        .contains("Ad perspiciatis quis")
        .click();
      H.popover().within(() => {
        cy.findByText("Is this").should("be.visible");
        cy.findByText("Is not this").should("be.visible");
      });

      cy.get("[data-testid=cell-data]").contains("May 15, 20").click();
      H.popover().within(() => {
        cy.findByText("Before").should("be.visible");
        cy.findByText("After").should("be.visible");
        cy.findByText("On").should("be.visible");
        cy.findByText("Not on").should("be.visible");
      });

      H.tableHeaderClick("ID");
      cy.findByTestId("click-actions-popover-content-for-ID").within(() => {
        cy.icon("arrow_down").should("be.visible");
        cy.icon("arrow_up").should("be.visible");
        cy.icon("gear").should("be.visible");

        cy.findByText("Filter by this column").should("be.visible");
        cy.findByText("Distinct values").should("be.visible");
      });

      H.tableHeaderClick("REVIEWER");
      cy.findByTestId("click-actions-popover-content-for-REVIEWER").within(
        () => {
          cy.icon("arrow_down").should("be.visible");
          cy.icon("arrow_up").should("be.visible");
          cy.icon("gear").should("be.visible");

          cy.findByText("Filter by this column").should("be.visible");
          cy.findByText("Distribution").should("be.visible");
          cy.findByText("Distinct values").should("be.visible");
        },
      );

      H.tableHeaderClick("RATING");
      cy.findByTestId("click-actions-popover-content-for-RATING").within(() => {
        cy.icon("arrow_down").should("be.visible");
        cy.icon("arrow_up").should("be.visible");
        cy.icon("gear").should("be.visible");

        cy.findByText("Filter by this column").should("be.visible");
        cy.findByText("Sum over time").should("be.visible");
        cy.findByText("Distribution").should("be.visible");

        cy.findByText("Sum").should("be.visible");
        cy.findByText("Avg").should("be.visible");
        cy.findByText("Distinct values").should("be.visible");
      });
    });

    it("should display proper drills on cell click for query aggregated by category", () => {
      H.createNativeQuestion(
        {
          name: "table_drills",
          native: {
            query: `
                  SELECT
                    REVIEWS.REVIEWER AS REVIEWER,
                    COUNT(*) AS count
                  FROM
                    REVIEWS
                  GROUP BY
                    REVIEWS.REVIEWER
                  LIMIT
                    10
                  `,
          },
        },
        { visitQuestion: true },
      );

      cy.findByTestId("TableInteractive-root")
        .findByText("abbey-heidenreich")
        .click();

      H.popover().within(() => {
        cy.findByText("Is abbey-heidenreich").should("be.visible");
        cy.findByText("Is not abbey-heidenreich").should("be.visible");
      });

      cy.get("[data-testid=cell-data]").contains("1").first().click();
      H.popover().within(() => {
        cy.findByText(">").should("be.visible");
        cy.findByText("<").should("be.visible");
        cy.findByText("=").should("be.visible");
        cy.findByText("≠").should("be.visible");
      });

      H.tableHeaderClick("REVIEWER");
      cy.findByTestId("click-actions-popover-content-for-REVIEWER").within(
        () => {
          cy.icon("arrow_down").should("be.visible");
          cy.icon("arrow_up").should("be.visible");
          cy.icon("gear").should("be.visible");

          cy.findByText("Filter by this column").should("be.visible");
        },
      );

      H.tableHeaderClick("COUNT");
      cy.findByTestId("click-actions-popover-content-for-COUNT").within(() => {
        cy.icon("arrow_down").should("be.visible");
        cy.icon("arrow_up").should("be.visible");
        cy.icon("gear").should("be.visible");

        cy.findByText("Filter by this column").should("be.visible");
      });
    });

    it("should display proper drills on cell click for query aggregated by date", () => {
      H.createNativeQuestion(
        {
          name: "table_drills",
          native: {
            query: `
            SELECT
              DATE_TRUNC('month', REVIEWS.CREATED_AT) AS "Created At",
              COUNT(*) AS "count"
            FROM
              REVIEWS
            GROUP BY
              DATE_TRUNC('month', REVIEWS.CREATED_AT)
            LIMIT
              10
                  `,
          },
        },
        { visitQuestion: true },
      );

      cy.get("[data-testid=cell-data]").contains("June").first().click();
      H.popover().within(() => {
        cy.findByText("Before").should("be.visible");
        cy.findByText("After").should("be.visible");
        cy.findByText("On").should("be.visible");
        cy.findByText("Not on").should("be.visible");
      });

      cy.get("[data-testid=cell-data]").contains("4").first().click();
      H.popover().within(() => {
        cy.findByText(">").should("be.visible");
        cy.findByText("<").should("be.visible");
        cy.findByText("=").should("be.visible");
        cy.findByText("≠").should("be.visible");
      });
    });
  });
});

describe("scenarios > visualizations > drillthroughs > table_drills > nulls", () => {
  beforeEach(() => {
    // It's important to restore to the "setup" to have access to "Accounts" table
    H.restore("setup");
    cy.signInAsAdmin();
    cy.viewport(1500, 800);
  });

  it("should display proper drills on a datetime cell click when there is no value (metabase#44101)", () => {
    const CANCELLED_AT_INDEX = 9;

    H.openTable({ table: ACCOUNTS_ID, limit: 1 });
    // eslint-disable-next-line no-unsafe-element-filtering
    cy.findAllByRole("gridcell")
      .eq(CANCELLED_AT_INDEX)
      .should("have.text", "")
      .click({ force: true });

    H.popover().within(() => {
      cy.findByText("Filter by this date and time").should("be.visible");
      cy.findByText("Is empty").should("be.visible");
      cy.findByText("Not empty").should("be.visible").click();
    });

    cy.findByTestId("filter-pill").should(
      "have.text",
      "Canceled At is not empty",
    );
    // eslint-disable-next-line no-unsafe-element-filtering
    cy.findAllByRole("gridcell")
      .eq(CANCELLED_AT_INDEX)
      .should("not.have.text", "");
  });
});
