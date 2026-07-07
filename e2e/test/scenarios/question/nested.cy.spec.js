const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ordersJoinProductsStage = {
  source: { type: "table", id: ORDERS_ID },
  joins: [
    {
      source: { type: "table", id: PRODUCTS_ID },
      strategy: "left-join",
      conditions: [
        {
          operator: "=",
          left: { type: "column", name: "PRODUCT_ID", sourceName: "ORDERS" },
          right: { type: "column", name: "ID", sourceName: "PRODUCTS" },
        },
      ],
    },
  ],
};

describe("scenarios > question > nested", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow 'Distribution' and 'Sum over time' on nested questions (metabase#12568)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    // Make sure it works for a GUI question
    const guiQuestionDetails = {
      name: "GH_12568: Simple",
      dataset_query: {
        database: SAMPLE_DB_ID,
        stages: [{ source: { type: "table", id: ORDERS_ID } }],
      },
      display: "line",
    };

    createNestedQuestion(
      {
        baseQuestionDetails: guiQuestionDetails,
        nestedQuestionDetails: { name: "Nested GUI" },
      },
      { loadBaseQuestionMetadata: true },
    );

    H.tableHeaderClick("Total");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Distribution").click();
    cy.wait("@dataset");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Count by Total: Auto binned");
    H.chartPathWithFillColor("#509EE3").should("have.length.of.at.least", 8);

    // Go back to the nested question and make sure Sum over time works
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Nested GUI").click();

    H.tableHeaderClick("Total");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sum over time").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sum of Total by Created At: Month");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("52.76");

    // Make sure it works for a SQL question
    const sqlQuestionDetails = {
      name: "GH_12568: SQL",
      dataset_query: {
        database: SAMPLE_DB_ID,
        query:
          "SELECT date_trunc('year', CREATED_AT) as date, COUNT(*) as count FROM ORDERS GROUP BY date_trunc('year', CREATED_AT)",
      },
      display: "scalar",
    };

    createNestedQuestion(
      {
        baseQuestionDetails: sqlQuestionDetails,
        nestedQuestionDetails: { name: "Nested SQL" },
      },
      { loadBaseQuestionMetadata: true },
    );

    H.tableHeaderClick("COUNT");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Distribution").click();
    cy.wait("@dataset");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Count by COUNT: Auto binned");
    H.chartPathWithFillColor("#509EE3").should("have.length.of.at.least", 5);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Nested SQL").click();

    H.tableHeaderClick("COUNT");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sum over time").click();
    cy.wait("@dataset");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sum of COUNT");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("744");
  });

  it("should handle duplicate column names in nested queries (metabase#10511)", () => {
    H.createCardWithTestQuery({
      name: "10511",
      dataset_query: {
        database: SAMPLE_DB_ID,
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [
              {
                type: "column",
                name: "CREATED_AT",
                sourceName: "ORDERS",
                unit: "month",
              },
              {
                type: "column",
                name: "CREATED_AT",
                sourceName: "Products",
                unit: "month",
              },
            ],
          },
          {
            filters: [
              {
                type: "operator",
                operator: ">",
                args: [
                  { type: "column", name: "count" },
                  { type: "literal", value: 5 },
                ],
              },
            ],
          },
        ],
      },
    }).then(H.visitCard);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("10511");
    cy.findAllByText("June 2025");
    cy.findAllByText("13");
  });

  it("should apply metrics including filter to the nested question (metabase#12507)", () => {
    const metric = {
      name: "Sum of discounts",
      description: "Discounted orders.",
      type: "metric",
      dataset_query: {
        database: SAMPLE_DB_ID,
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            filters: [
              {
                type: "operator",
                operator: "!=",
                args: [
                  { type: "column", name: "DISCOUNT", sourceName: "ORDERS" },
                  { type: "literal", value: 0 },
                ],
              },
            ],
          },
        ],
      },
    };

    cy.log("Create a metric with a filter");
    H.createCardWithTestQuery(metric).then((card) => {
      cy.wrap(card.id).as("metricId");
    });

    cy.get("@metricId").then((metricId) => {
      // "capture" the original query because we will need to re-use it later in a nested question as "source-query"
      const baseQuestionDetails = {
        name: "12507",
        dataset_query: {
          database: SAMPLE_DB_ID,
          stages: [
            {
              source: { type: "card", id: metricId },
              aggregations: [{ type: "metric", id: metricId }],
              breakouts: [
                {
                  type: "column",
                  name: "TOTAL",
                  sourceName: "ORDERS",
                  bins: "auto",
                },
              ],
            },
          ],
        },
      };

      const nestedQuestionDetails = {
        stage: {
          filters: [
            {
              type: "operator",
              operator: ">",
              args: [
                { type: "column", name: "TOTAL", sourceName: "ORDERS" },
                { type: "literal", value: 50 },
              ],
            },
          ],
        },
      };

      // Create new question which uses previously defined metric
      createNestedQuestion({ baseQuestionDetails, nestedQuestionDetails });

      cy.log("Reported failing since v0.35.2");
      H.assertQueryBuilderRowCount(5);
    });
  });

  it("should handle remapped display values in a base QB question (metabase#10474)", () => {
    cy.log(
      "Related issue [#14629](https://github.com/metabase/metabase/issues/14629)",
    );

    cy.log("Remap Product ID's display value to `title`");
    H.remapDisplayValueToFK({
      display_value: ORDERS.PRODUCT_ID,
      name: "Product ID",
      fk: PRODUCTS.TITLE,
    });

    const baseQuestionDetails = {
      name: "Orders (remapped)",
      dataset_query: {
        database: SAMPLE_DB_ID,
        stages: [{ source: { type: "table", id: ORDERS_ID }, limit: 5 }],
      },
    };

    createNestedQuestion({ baseQuestionDetails });

    cy.findAllByText("Awesome Concrete Shoes");
  });

  it("nested questions based on a saved question with joins should work (metabase#14724)", () => {
    const baseQuestionDetails = {
      name: "14724",
      dataset_query: {
        database: SAMPLE_DB_ID,
        stages: [ordersJoinProductsStage],
      },
    };

    ["default", "remapped"].forEach((scenario) => {
      if (scenario === "remapped") {
        cy.log("Remap Product ID's display value to `title`");
        H.remapDisplayValueToFK({
          display_value: ORDERS.PRODUCT_ID,
          name: "Product ID",
          fk: PRODUCTS.TITLE,
        });
      }

      // should hangle single-level nesting
      createNestedQuestion({ baseQuestionDetails });

      cy.contains("37.65");

      // should handle multi-level nesting
      cy.get("@nestedQuestionId").then((id) => {
        visitNestedQueryAdHoc(id);
        cy.contains("37.65");
      });
    });
  });

  it("'distribution' should work on a joined table from a saved question (metabase#14787)", () => {
    // Set the display really wide and really tall to avoid any scrolling
    cy.viewport(1600, 1200);
    cy.intercept("POST", "/api/dataset").as("dataset");

    const baseQuestionDetails = {
      name: "14787",
      dataset_query: {
        database: SAMPLE_DB_ID,
        stages: [{ ...ordersJoinProductsStage, limit: 5 }],
      },
    };

    createNestedQuestion({ baseQuestionDetails });

    // The column title
    H.tableHeaderClick("Products → Category");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Distribution").click();
    cy.wait("@dataset");

    H.summarize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Group by")
      .parent()
      .within(() => {
        cy.log("Regression that worked on 0.37.9");
        isSelected("Products → Category");
      });

    // Although the test will fail on the previous step, we're including additional safeguards against regressions once the issue is fixed
    // It can potentially fail at two more places. See [1] and [2]
    H.openNotebook();
    cy.findAllByTestId("notebook-cell-item")
      .contains(/^Products → Category$/) /* [1] */
      .click();
    H.popover().within(() => {
      isSelected("Products → Category"); /* [2] */
    });

    /**
     * Helper function related to this test only
     * TODO:
     *  Extract it if we have the need for it anywhere else
     */
    function isSelected(text) {
      H.getDimensionByName({ name: text }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    }
  });

  it("should be able to use aggregation functions on saved native question (metabase#15397)", () => {
    H.createCardWithTestNativeQuery({
      name: "15397",
      dataset_query: {
        database: SAMPLE_DB_ID,
        query:
          "select count(*), orders.product_id from orders group by orders.product_id;",
      },
    }).then(({ id }) => {
      H.visitQuestion(id);

      visitNestedQueryAdHoc(id);

      // Count
      H.summarize();

      cy.findByText("Group by").parent().findByText("COUNT(*)").click();
      cy.wait("@dataset");

      H.chartPathWithFillColor("#509EE3").should("have.length.of.at.least", 5);

      // Replace "Count" with the "Average"
      cy.findByTestId("aggregation-item").contains("Count").click();
      cy.findByText("Average of ...").click();
      H.popover().findByText("COUNT(*)").click();
      cy.wait("@dataset");

      H.chartPathWithFillColor("#A989C5").should("have.length.of.at.least", 5);
    });
  });

  describe("should use the same query for date filter in both base and nested questions (metabase#15352)", () => {
    it("should work with 'between' date filter (metabase#15352-1)", () => {
      assertOnFilter({
        name: "15352-1",
        filter: {
          type: "operator",
          operator: "between",
          args: [
            { type: "column", name: "CREATED_AT", sourceName: "ORDERS" },
            { type: "literal", value: "2029-02-01" },
            { type: "literal", value: "2029-02-29" },
          ],
        },
        value: "543",
      });
    });

    it("should work with 'after/before' date filter (metabase#15352-2)", () => {
      assertOnFilter({
        name: "15352-2",
        filter: {
          type: "operator",
          operator: "and",
          args: [
            {
              type: "operator",
              operator: ">",
              args: [
                { type: "column", name: "CREATED_AT", sourceName: "ORDERS" },
                { type: "literal", value: "2029-01-31" },
              ],
            },
            {
              type: "operator",
              operator: "<",
              args: [
                { type: "column", name: "CREATED_AT", sourceName: "ORDERS" },
                { type: "literal", value: "2029-03-01" },
              ],
            },
          ],
        },
        value: "543",
      });
    });

    it("should work with 'on' date filter (metabase#15352-3)", () => {
      assertOnFilter({
        name: "15352-3",
        filter: {
          type: "operator",
          operator: "=",
          args: [
            { type: "column", name: "CREATED_AT", sourceName: "ORDERS" },
            { type: "literal", value: "2029-02-01" },
          ],
        },
        value: "17",
      });
    });

    function assertOnFilter({ name, filter, value } = {}) {
      H.createCardWithTestQuery({
        name,
        dataset_query: {
          database: SAMPLE_DB_ID,
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              filters: [filter],
              aggregations: [{ type: "operator", operator: "count" }],
            },
          ],
        },
        display: "scalar",
      }).then((card) => {
        H.visitQuestion(card.id);
        cy.findByTestId("scalar-value").findByText(value);

        visitNestedQueryAdHoc(card.id);
        cy.findByTestId("scalar-value").findByText(value);
      });
    }
  });

  describe("should not remove user defined metric when summarizing based on saved question (metabase#15725)", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      H.createCardWithTestNativeQuery({
        name: "15725",
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: "select 'A' as cat, 5 as val",
        },
      });
      // Window object gets recreated for every `cy.visit`
      // See: https://stackoverflow.com/a/65218352/8815185
      cy.visit("/", {
        onBeforeLoad(win) {
          cy.spy(win.console, "warn").as("consoleWarn");
        },
      });
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question").should("be.visible").click();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("15725").click();
      });
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a function or metric").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count of rows").click();
    });

    it("Count of rows AND Sum of VAL by CAT (metabase#15725-1)", () => {
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.icon("add").last().click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Sum of/).click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("VAL").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sum of VAL");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("CAT").click();

      H.visualize();

      cy.get("@consoleWarn").should(
        "not.be.calledWith",
        "Removing invalid MBQL clause",
      );
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sum of VAL");
    });

    it("Count of rows by CAT + add sum of VAL later from the sidebar (metabase#15725-2)", () => {
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("CAT").click();

      H.visualize();

      H.summarize();
      cy.findByTestId("add-aggregation-button").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Sum of/).click();
      H.popover().findByText("VAL").click();
      cy.wait("@dataset").then((xhr) => {
        expect(xhr.response.body.error).not.to.exist;
      });
      cy.get("@consoleWarn").should(
        "not.be.calledWith",
        "Removing invalid MBQL clause",
      );
    });
  });

  it("should properly work with native questions (metabase#15808, metabase#16938, metabase#18364)", () => {
    const questionDetails = {
      name: "15808",
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: "select * from products limit 3",
      },
    };

    H.createCardWithTestNativeQuery(questionDetails).then(H.visitCard);
    cy.findAllByTestId("cell-data").should(
      "contain",
      "Swaniawski, Casper and Hilll",
    );

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.findByTestId("qb-header-action-panel")
      .findByText("Explore results")
      .click();
    cy.wait("@dataset");

    cy.log(
      "Should allow to browse object details when exploring native query results (metabase#16938)",
    );
    cy.get(".test-Table-ID").as("primaryKeys").should("have.length", 3);
    cy.get("@primaryKeys").first().click();

    cy.findByTestId("object-detail").should(
      "contain",
      "Swaniawski, Casper and Hilll",
    );
    cy.findByLabelText("Close").click();

    cy.log("Should be able to save a nested question (metabase#18364)");
    saveQuestion();

    cy.log(
      "Should be able to use integer filter on a nested query based on a saved native question (metabase#15808)",
    );
    H.filter();
    H.popover().findByText("RATING").click();
    H.selectFilterOperator("Equal to");
    H.popover().within(() => {
      cy.findByLabelText("Filter value").type("4");
      cy.button("Apply filter").click();
    });

    cy.findAllByTestId("cell-data")
      .should("contain", "Murray, Watsica and Wunsch")
      .and("not.contain", "Swaniawski, Casper and Hilll");

    function saveQuestion() {
      cy.intercept("POST", "/api/card").as("cardCreated");

      H.saveQuestionToCollection();

      cy.wait("@cardCreated").then(({ response: { body } }) => {
        expect(body.error).not.to.exist;
      });

      cy.button("Failed").should("not.exist");
    }
  });

  it("should create a nested question with post-aggregation filter (metabase#11561)", () => {
    H.visitAdHocQuestionWithTestQuery({
      dataset_query: {
        database: SAMPLE_DB_ID,
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [{ type: "column", name: "ID", sourceName: "People" }],
          },
        ],
      },
    });

    H.filter();
    H.popover().within(() => {
      cy.findByText("Summaries").click();
      cy.findByText("Count").click();
    });
    H.selectFilterOperator("Equal to");
    H.popover().within(() => {
      cy.findByLabelText("Filter value").type("5");
      cy.button("Apply filter").click();
    });
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().findByText("Count is equal to 5");
    H.assertQueryBuilderRowCount(100);

    H.saveQuestionToCollection();

    reloadQuestion();
    H.assertQueryBuilderRowCount(100);

    H.openNotebook();
    cy.findAllByTestId("notebook-cell-item").contains(/Users? → ID/);

    function reloadQuestion() {
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");
      cy.reload();
      cy.wait("@cardQuery");
    }
  });
});

function createNestedQuestion(
  { baseQuestionDetails, nestedQuestionDetails = {} },
  { loadBaseQuestionMetadata = false, visitNestedQuestion = true } = {},
) {
  if (!baseQuestionDetails) {
    throw new Error("Please provide the base question details");
  }

  createBaseQuestion(baseQuestionDetails).then((baseCard) => {
    if (loadBaseQuestionMetadata) {
      H.visitCard(baseCard);
    }

    const { stage: nestedStage, ...details } = nestedQuestionDetails;

    const composite = {
      name: "Nested Question",
      ...details,
      dataset_query: {
        database: SAMPLE_DB_ID,
        stages: [{ source: { type: "card", id: baseCard.id }, ...nestedStage }],
      },
    };

    return H.createCardWithTestQuery(composite).then((nestedCard) => {
      if (visitNestedQuestion) {
        H.visitCard(nestedCard);
      }
      cy.wrap(nestedCard.id).as("nestedQuestionId");
    });
  });

  function createBaseQuestion(details) {
    return details.dataset_query.stages
      ? H.createCardWithTestQuery(details)
      : H.createCardWithTestNativeQuery(details);
  }
}

function visitNestedQueryAdHoc(id) {
  return H.visitAdHocQuestionWithTestQuery({
    dataset_query: {
      database: SAMPLE_DB_ID,
      stages: [{ source: { type: "card", id } }],
    },
  });
}
