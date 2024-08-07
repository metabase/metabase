import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  openNotebook,
  remapDisplayValueToFK,
  visitQuestion,
  visitQuestionAdhoc,
  visualize,
  getDimensionByName,
  summarize,
  filter,
  filterField,
  chartPathWithFillColor,
  assertQueryBuilderRowCount,
  entityPickerModal,
  entityPickerModalTab,
  tableHeaderClick,
  createNativeQuestion,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE } = SAMPLE_DATABASE;

const ordersJoinProductsQuery = {
  "source-table": ORDERS_ID,
  joins: [
    {
      fields: "all",
      "source-table": PRODUCTS_ID,
      condition: [
        "=",
        ["field", ORDERS.PRODUCT_ID, null],
        ["field", PRODUCTS.ID, { "join-alias": "Products" }],
      ],
      alias: "Products",
    },
  ],
};

describe("scenarios > question > nested", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow 'Distribution' and 'Sum over time' on nested questions (metabase#12568)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    // Make sure it works for a GUI question
    const guiQuestionDetails = {
      name: "GH_12568: Simple",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
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

    tableHeaderClick("Count");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Distribution").click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Count by Count: Auto binned");
    chartPathWithFillColor("#A989C5").should("have.length.of.at.least", 8);

    // Go back to the nested question and make sure Sum over time works
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Nested GUI").click();

    tableHeaderClick("Count");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sum over time").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sum of Count");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("137");

    // Make sure it works for a SQL question
    const sqlQuestionDetails = {
      name: "GH_12568: SQL",
      native: {
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

    tableHeaderClick("COUNT");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Distribution").click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Count by COUNT: Auto binned");
    chartPathWithFillColor("#509EE3").should("have.length.of.at.least", 5);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Nested SQL").click();

    tableHeaderClick("COUNT");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sum over time").click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sum of COUNT");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("744");
  });

  it("should handle duplicate column names in nested queries (metabase#10511)", () => {
    cy.createQuestion(
      {
        name: "10511",
        query: {
          filter: [">", ["field", "count", { "base-type": "type/Integer" }], 5],
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
              [
                "field",
                PRODUCTS.CREATED_AT,
                { "temporal-unit": "month", "source-field": ORDERS.PRODUCT_ID },
              ],
            ],
          },
        },
      },
      { visitQuestion: true },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("10511");
    cy.findAllByText("June 2022");
    cy.findAllByText("13");
  });

  it("should apply metrics including filter to the nested question (metabase#12507)", () => {
    const metric = {
      name: "Sum of discounts",
      description: "Discounted orders.",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        filter: ["!=", ["field", ORDERS.DISCOUNT, null], 0],
      },
    };

    cy.log("Create a metric with a filter");
    cy.createQuestion(metric, {
      wrapId: true,
      idAlias: "metricId",
    });

    cy.get("@metricId").then(metricId => {
      // "capture" the original query because we will need to re-use it later in a nested question as "source-query"
      const baseQuestionDetails = {
        name: "12507",
        query: {
          "source-table": `card__${metricId}`,
          aggregation: [["metric", metricId]],
          breakout: [
            ["field", ORDERS.TOTAL, { binning: { strategy: "default" } }],
          ],
        },
      };

      const nestedQuestionDetails = {
        query: {
          filter: [">", ["field", ORDERS.TOTAL, null], 50],
        },
      };

      // Create new question which uses previously defined metric
      createNestedQuestion({ baseQuestionDetails, nestedQuestionDetails });

      cy.log("Reported failing since v0.35.2");
      assertQueryBuilderRowCount(5);
    });
  });

  it("should handle remapped display values in a base QB question (metabase#10474)", () => {
    cy.log(
      "Related issue [#14629](https://github.com/metabase/metabase/issues/14629)",
    );

    cy.log("Remap Product ID's display value to `title`");
    remapDisplayValueToFK({
      display_value: ORDERS.PRODUCT_ID,
      name: "Product ID",
      fk: PRODUCTS.TITLE,
    });

    const baseQuestionDetails = {
      name: "Orders (remapped)",
      query: { "source-table": ORDERS_ID, limit: 5 },
    };

    createNestedQuestion({ baseQuestionDetails });

    cy.findAllByText("Awesome Concrete Shoes");
  });

  it("nested questions based on a saved question with joins should work (metabase#14724)", () => {
    const baseQuestionDetails = {
      name: "14724",
      query: ordersJoinProductsQuery,
    };

    ["default", "remapped"].forEach(scenario => {
      if (scenario === "remapped") {
        cy.log("Remap Product ID's display value to `title`");
        remapDisplayValueToFK({
          display_value: ORDERS.PRODUCT_ID,
          name: "Product ID",
          fk: PRODUCTS.TITLE,
        });
      }

      // should hangle single-level nesting
      createNestedQuestion({ baseQuestionDetails });

      cy.contains("37.65");

      // should handle multi-level nesting
      cy.get("@nestedQuestionId").then(id => {
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
      query: { ...ordersJoinProductsQuery, limit: 5 },
    };

    createNestedQuestion({ baseQuestionDetails });

    // The column title
    tableHeaderClick("Products → Category");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Distribution").click();
    cy.wait("@dataset");

    summarize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Group by")
      .parent()
      .within(() => {
        cy.log("Regression that worked on 0.37.9");
        isSelected("Products → Category");
      });

    // Although the test will fail on the previous step, we're including additional safeguards against regressions once the issue is fixed
    // It can potentially fail at two more places. See [1] and [2]
    openNotebook();
    cy.findAllByTestId("notebook-cell-item")
      .contains(/^Products → Category$/) /* [1] */
      .click();
    popover().within(() => {
      isSelected("Products → Category"); /* [2] */
    });

    /**
     * Helper function related to this test only
     * TODO:
     *  Extract it if we have the need for it anywhere else
     */
    function isSelected(text) {
      getDimensionByName({ name: text }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    }
  });

  it("should be able to use aggregation functions on saved native question (metabase#15397)", () => {
    cy.createNativeQuestion({
      name: "15397",
      native: {
        query:
          "select count(*), orders.product_id from orders group by orders.product_id;",
      },
    }).then(({ body: { id } }) => {
      visitQuestion(id);

      visitNestedQueryAdHoc(id);

      // Count
      summarize();

      cy.findByText("Group by").parent().findByText("COUNT(*)").click();
      cy.wait("@dataset");

      chartPathWithFillColor("#509EE3").should("have.length.of.at.least", 5);

      // Replace "Count" with the "Average"
      cy.findByTestId("aggregation-item").contains("Count").click();
      cy.findByText("Average of ...").click();
      popover().findByText("COUNT(*)").click();
      cy.wait("@dataset");

      chartPathWithFillColor("#A989C5").should("have.length.of.at.least", 5);
    });
  });

  describe("should use the same query for date filter in both base and nested questions (metabase#15352)", () => {
    it("should work with 'between' date filter (metabase#15352-1)", () => {
      assertOnFilter({
        name: "15352-1",
        filter: [
          "between",
          ["field-id", ORDERS.CREATED_AT],
          "2026-02-01",
          "2026-02-29",
        ],
        value: "543",
      });
    });

    it("should work with 'after/before' date filter (metabase#15352-2)", () => {
      assertOnFilter({
        name: "15352-2",
        filter: [
          "and",
          [">", ["field-id", ORDERS.CREATED_AT], "2026-01-31"],
          ["<", ["field-id", ORDERS.CREATED_AT], "2026-03-01"],
        ],
        value: "543",
      });
    });

    it("should work with 'on' date filter (metabase#15352-3)", () => {
      assertOnFilter({
        name: "15352-3",
        filter: ["=", ["field-id", ORDERS.CREATED_AT], "2026-02-01"],
        value: "17",
      });
    });

    function assertOnFilter({ name, filter, value } = {}) {
      cy.createQuestion({
        name,
        query: {
          "source-table": ORDERS_ID,
          filter,
          aggregation: [["count"]],
        },
        type: "query",
        display: "scalar",
      }).then(({ body: { id } }) => {
        visitQuestion(id);
        cy.findByTestId("scalar-value").findByText(value);

        visitNestedQueryAdHoc(id);
        cy.findByTestId("scalar-value").findByText(value);
      });
    }
  });

  describe("should not remove user defined metric when summarizing based on saved question (metabase#15725)", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.createNativeQuestion({
        name: "15725",
        native: { query: "select 'A' as cat, 5 as val" },
      });
      // Window object gets recreated for every `cy.visit`
      // See: https://stackoverflow.com/a/65218352/8815185
      cy.visit("/", {
        onBeforeLoad(win) {
          cy.spy(win.console, "warn").as("consoleWarn");
        },
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question").should("be.visible").click();
      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").click();
        cy.findByText("15725").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick the metric you want to see").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count of rows").click();
    });

    it("Count of rows AND Sum of VAL by CAT (metabase#15725-1)", () => {
      cy.icon("add").last().click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Sum of/).click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("VAL").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sum of VAL");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("CAT").click();

      visualize();

      cy.get("@consoleWarn").should(
        "not.be.calledWith",
        "Removing invalid MBQL clause",
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sum of VAL");
    });

    it("Count of rows by CAT + add sum of VAL later from the sidebar (metabase#15725-2)", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("CAT").click();

      visualize();

      summarize();
      cy.findByTestId("add-aggregation-button").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Sum of/).click();
      popover().findByText("VAL").click();
      cy.wait("@dataset").then(xhr => {
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
      native: { query: "select * from products limit 3" },
    };

    createNativeQuestion(questionDetails, { visitQuestion: true });
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
    cy.findByTestId("object-detail-close-button").click();

    cy.log("Should be able to save a nested question (metabase#18364)");
    saveQuestion();

    cy.log(
      "Should be able to use integer filter on a nested query based on a saved native question (metabase#15808)",
    );
    filter();
    filterField("RATING", {
      operator: "Equal to",
      value: "4",
    });
    cy.findByTestId("apply-filters").click();

    cy.findAllByTestId("cell-data")
      .should("contain", "Murray, Watsica and Wunsch")
      .and("not.contain", "Swaniawski, Casper and Hilll");

    function saveQuestion() {
      cy.intercept("POST", "/api/card").as("cardCreated");

      cy.findByText("Save").click({ force: true });
      cy.findByTestId("save-question-modal").within(modal => {
        cy.findByText("Save").click();
      });

      cy.wait("@cardCreated").then(({ response: { body } }) => {
        expect(body.error).not.to.exist;
      });

      cy.button("Failed").should("not.exist");
      cy.findByText("Not now").click();
    }
  });

  it("should create a nested question with post-aggregation filter (metabase#11561)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", PEOPLE.ID, { "source-field": ORDERS.USER_ID }]],
        },
        type: "query",
      },
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summaries").click();
    filterField("Count", {
      operator: "Equal to",
      value: "5",
    });
    cy.button("Apply filters").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count is equal to 5");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 100 rows");

    saveQuestion();

    reloadQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 100 rows");

    openNotebook();
    cy.findAllByTestId("notebook-cell-item").contains(/Users? → ID/);

    function saveQuestion() {
      cy.intercept("POST", "/api/card").as("cardCreated");

      cy.findByText("Save").click();

      cy.findByTestId("save-question-modal").then(modal => {
        cy.findByLabelText("Name").type("Q").blur();
        cy.findByTestId("save-question-button").click();
      });

      cy.wait("@cardCreated");
      cy.findByText("Not now").click();
    }

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

  createBaseQuestion(baseQuestionDetails).then(({ body: { id } }) => {
    loadBaseQuestionMetadata && visitQuestion(id);

    const { query: nestedQuery, ...details } = nestedQuestionDetails;

    const composite = {
      name: "Nested Question",
      query: {
        ...nestedQuery,
        "source-table": `card__${id}`,
      },
      ...details,
    };

    return cy.createQuestion(composite, {
      visitQuestion: visitNestedQuestion,
      wrapId: true,
      idAlias: "nestedQuestionId",
    });
  });

  function createBaseQuestion(query) {
    return query.native
      ? cy.createNativeQuestion(query)
      : cy.createQuestion(query);
  }
}

function visitNestedQueryAdHoc(id) {
  return visitQuestionAdhoc({
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: { "source-table": `card__${id}` },
    },
  });
}
