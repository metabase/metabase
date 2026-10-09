import _ from "underscore";

const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const tableQuestion = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
  },
  limit: 5,
};

const tableQuestionWithJoin = {
  display: "table",
  query: {
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
    limit: 5,
  },
};

const tableQuestionWithJoinOnQuestion = (card) => ({
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    fields: [
      ["field", ORDERS.ID, null],
      ["field", ORDERS.TAX, null],
    ],
    joins: [
      {
        fields: "all",
        "source-table": `card__${card.id}`,
        condition: [
          "=",
          ["field", ORDERS.ID, null],
          ["field", ORDERS.ID, { "join-alias": `Question ${card.id}` }],
        ],
        alias: `Question ${card.id}`,
      },
    ],
    limit: 5,
  },
});

const tableQuestionWithJoinAndFields = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    joins: [
      {
        "source-table": PRODUCTS_ID,
        fields: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
        alias: "Products",
      },
    ],
  },
  limit: 5,
};

const tableQuestionWithSelfJoinAndFields = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    fields: [
      ["field", ORDERS.ID, null],
      ["field", ORDERS.TAX, null],
    ],
    joins: [
      {
        "source-table": ORDERS_ID,
        fields: [
          ["field", ORDERS.ID, { "join-alias": "Orders" }],
          ["field", ORDERS.TAX, { "join-alias": "Orders" }],
        ],
        condition: [
          "=",
          ["field", ORDERS.USER_ID, null],
          ["field", ORDERS.ID, { "join-alias": "Orders" }],
        ],
        alias: "Orders",
      },
    ],
    limit: 5,
  },
};

const tableQuestionWithExpression = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    fields: [
      ["field", ORDERS.ID, null],
      ["expression", "Math"],
    ],
    expressions: {
      Math: ["+", 1, 1],
    },
    limit: 5,
  },
};

const tableQuestionWithExpressionAndFields = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      Math: ["+", 1, 1],
    },
    fields: [
      ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
      ["expression", "Math", { "base-type": "type/Integer" }],
    ],
  },
};

const tableWithAggregations = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["count"],
      ["sum", ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }]],
    ],
    limit: 5,
  },
};

const multiStageQuestion = {
  query: {
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }]],
    },
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
    limit: 5,
  },
};

const nativeQuestion = {
  display: "table",
  native: {
    query: "SELECT * FROM ORDERS",
  },
  limit: 5,
};

const nestedQuestion = (card) => ({
  display: "table",
  query: {
    "source-table": `card__${card.id}`,
  },
  limit: 5,
});

const nestedQuestionWithJoinOnTable = (card) => ({
  display: "table",
  query: {
    "source-table": `card__${card.id}`,
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
    limit: 5,
  },
});

const nestedQuestionWithJoinOnQuestion = (card) => ({
  display: "table",
  query: {
    "source-table": `card__${card.id}`,
    joins: [
      {
        fields: "all",
        "source-table": `card__${card.id}`,
        condition: [
          "=",
          ["field", ORDERS.ID, null],
          ["field", ORDERS.ID, { "join-alias": `Question ${card.id}` }],
        ],
        alias: `Question ${card.id}`,
      },
    ],
    limit: 5,
  },
});

describe("scenarios > visualizations > table column settings", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  const _hideColumn = ({
    column,
    columnName,
    table,
    sanityCheck,
    needsScroll = true,
    scrollTimes = 1,
  }) => {
    cy.log("hide the column");
    visibleColumns().within(() => hideColumn(columnName));
    assertColumnHidden(getColumn(columnName));
    if (sanityCheck) {
      assertColumnEnabled(getColumn(sanityCheck));
    }
    if (needsScroll) {
      _.times(scrollTimes, () => {
        scrollVisualization();
        cy.wait(200);
      });
    }
    visualization().findByText(columnName).should("not.exist");

    cy.findByRole("button", { name: /Add or remove columns/ }).click();
    cy.findByTestId(`${table}-table-columns`)
      .findByLabelText(column)
      .should("be.checked");
    cy.findByRole("button", { name: /Done picking columns/ }).click();
  };

  const _showColumn = ({
    columnName,
    sanityCheck,
    needsScroll = true,
    scrollTimes = 1,
  }) => {
    visibleColumns().within(() => showColumn(columnName));
    assertColumnEnabled(getColumn(columnName));
    if (sanityCheck) {
      assertColumnEnabled(getColumn(sanityCheck));
    }
    if (needsScroll) {
      _.times(scrollTimes, () => {
        scrollVisualization();
        cy.wait(200);
      });
    }
    visualization().findByText(columnName).should("exist");
  };

  const _removeColumn = ({
    column,
    columnName,
    table,
    sanityCheck,
    needsScroll = true,
    scrollTimes = 1,
  }) => {
    cy.log("remove the column");
    cy.findByRole("button", { name: /Add or remove columns/ }).click();
    cy.findByTestId(`${table}-table-columns`)
      .findByLabelText(column)
      .should("be.checked")
      .click();
    cy.wait("@dataset");
    cy.findByText("Doing science...").should("not.exist");
    if (needsScroll) {
      _.times(scrollTimes, () => {
        scrollVisualization();
        cy.wait(200);
      });
    }
    visualization().findByText(columnName).should("not.exist");
    cy.findByRole("button", { name: /Done picking columns/ }).click();
    getColumn(columnName).should("not.exist");
    if (sanityCheck) {
      assertColumnEnabled(getColumn(sanityCheck));
    }
  };

  const _addColumn = ({
    column,
    columnName,
    table,
    sanityCheck,
    needsScroll = true,
    scrollTimes = 1,
  }) => {
    cy.log("add the column");
    cy.findByRole("button", { name: /Add or remove columns/ }).click();
    cy.findByTestId(`${table}-table-columns`)
      .findByLabelText(column)
      .should("not.be.checked")
      .click();
    cy.wait("@dataset");
    cy.findByText("Doing science...").should("not.exist");
    if (needsScroll) {
      _.times(scrollTimes, () => {
        scrollVisualization();
        cy.wait(200);
      });
    }
    visualization().findByText(columnName).should("exist");
    cy.findByRole("button", { name: /Done picking columns/ }).click();
    assertColumnEnabled(getColumn(columnName));
    if (sanityCheck) {
      assertColumnEnabled(getColumn(sanityCheck));
    }
  };

  describe("tables", () => {
    it("should be able to show and hide table fields", () => {
      H.createQuestion(tableQuestion, { visitQuestion: true });
      openSettings();

      const testData = {
        column: "Tax",
        columnName: "Tax",
        sanityCheck: "ID",
        table: "orders",
      };

      _hideColumn(testData);
      _showColumn(testData);
      _removeColumn(testData);
      _addColumn(testData);
    });

    it("should be able to rename table columns via popover", () => {
      H.createQuestion(tableQuestion, { visitQuestion: true });

      H.tableHeaderClick("Product ID");

      H.popover().within(() => {
        cy.icon("gear").click();
        cy.findByDisplayValue("Product ID").clear().type("prod_id");
      });

      // clicking outside of the popover to close it
      cy.findByTestId("app-bar").click();

      H.tableInteractive().within(() => {
        cy.findByText("prod_id");
      });
    });

    it("should be able to show and hide table fields with in a join", () => {
      H.createQuestion(tableQuestionWithJoin, { visitQuestion: true });
      openSettings();

      const testData = {
        column: "Category",
        columnName: "Products → Category",
        sanityCheck: "Products → Ean",
        table: "products",
      };

      _hideColumn(testData);
      _showColumn(testData);
      _removeColumn(testData);
      _addColumn(testData);
    });

    it("should be able to show and hide all table fields with a single click", () => {
      H.createQuestion(tableQuestionWithJoin, { visitQuestion: true });
      openSettings();

      cy.findByRole("button", { name: /Add or remove columns/ }).click();

      cy.findByTestId("products-table-columns")
        .findByLabelText("Remove all")
        .click();

      cy.wait("@dataset");
      cy.findByTestId("query-builder-main")
        .findByText("Doing science...")
        .should("not.exist");

      cy.findByTestId("products-table-columns").within(() => {
        //Check a few columns as a sanity check
        cy.findByLabelText("Title").should("not.be.checked");
        cy.findByLabelText("Category").should("not.be.checked");
        cy.findByLabelText("Price").should("not.be.checked");

        //Enable all columns
        cy.findByLabelText("Add all").should("not.be.checked").click();
      });

      cy.wait("@dataset");
      cy.findByTestId("query-builder-main")
        .findByText("Doing science...")
        .should("not.exist");

      cy.findByTestId("products-table-columns").within(() => {
        //Check a few columns as a sanity check
        cy.findByLabelText("Title").should("be.checked");
        cy.findByLabelText("Category").should("be.checked");
        cy.findByLabelText("Price").should("be.checked");
      });
    });

    it("should be able to show and hide table fields with a join with fields", () => {
      H.createQuestion(tableQuestionWithJoinAndFields, {
        visitQuestion: true,
      });
      openSettings();

      const firstColumn = {
        column: "Category",
        columnName: "Products → Category",
        table: "products",
      };

      const secondColumn = {
        column: "Ean",
        columnName: "Products → Ean",
        table: "products",
      };

      _hideColumn(firstColumn);
      _removeColumn(firstColumn);

      _addColumn(secondColumn);
    });

    it("should be able to show and hide table fields with a self join with fields", () => {
      H.createQuestion(tableQuestionWithSelfJoinAndFields, {
        visitQuestion: true,
      });
      openSettings();

      const testData = {
        column: "Tax",
        columnName: "Orders → Tax",
        table: "orders 2",
        needsScroll: false,
      };

      _hideColumn(testData);
      _showColumn(testData);
      _removeColumn(testData);
      _addColumn(testData);
    });

    it("should be able to show and hide implicitly joinable fields for a table", () => {
      H.createQuestion(tableQuestion, { visitQuestion: true });
      openSettings();

      const testData = {
        column: "Category",
        columnName: "Product → Category",
        table: "product",
      };

      _addColumn(testData);
      _hideColumn(testData);
      _showColumn(testData);
      _removeColumn(testData);
    });

    it("should be able to show and hide custom expressions for a table", () => {
      H.createQuestion(tableQuestionWithExpression, {
        visitQuestion: true,
      });
      openSettings();

      const testData = {
        column: "Math",
        columnName: "Math",
        table: "orders",
        needsScroll: false,
      };

      _hideColumn(testData);
      _showColumn(testData);
    });

    it("should be able to show and hide custom expressions for a table with selected fields", () => {
      H.createQuestion(tableQuestionWithExpressionAndFields, {
        visitQuestion: true,
      });
      openSettings();

      const testData = {
        column: "Math",
        columnName: "Math",
        table: "orders",
        needsScroll: false,
      };

      _hideColumn(testData);
      _showColumn(testData);
    });

    it("should be able to show and hide columns from aggregations", () => {
      H.createQuestion(tableWithAggregations, { visitQuestion: true });
      openSettings();

      const testData = {
        column: "Count",
        columnName: "Count",
        table: "orders",
        sanityCheck: "Sum of Quantity",
        needsScroll: false,
      };

      const testData2 = {
        column: "Sum of Quantity",
        columnName: "Sum of Quantity",
        table: "orders",
        sanityCheck: "Count",
        needsScroll: false,
      };

      _hideColumn(testData);
      _showColumn(testData);
      _hideColumn(testData2);
      _showColumn(testData2);
    });

    it("should allow enabling text wrapping", () => {
      H.openReviewsTable();
      H.openColumnOptions("Body");

      H.assertRowHeight(0, 36);

      H.popover().within(() => {
        cy.icon("gear").click();
        cy.findByText("Wrap text").click();
      });

      H.assertRowHeight(0, 53);

      H.popover().within(() => {
        cy.findByText("Wrap text").click();
      });

      H.assertRowHeight(0, 36);
    });

    describe("issue 22206", () => {
      beforeEach(() => {
        H.openOrdersTable();

        cy.findByTestId("loading-indicator").should("not.exist");
      });

      it("should not duplicate column in settings when removing and adding it back (metabase#22206)", () => {
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
  });

  describe("multi-stage questions", () => {
    it("should be able to show and hide table fields in a multi-stage query", () => {
      H.createQuestion(multiStageQuestion, { visitQuestion: true });
      openSettings();

      const testData = {
        column: "Count",
        columnName: "Count",
        table: "summaries",
        sanityCheck: "Product ID",
        needsScroll: false,
      };

      const testData2 = {
        column: "Product ID",
        columnName: "Product ID",
        table: "summaries",
        sanityCheck: "Count",
        needsScroll: false,
      };

      _hideColumn(testData);
      _showColumn(testData);
      _hideColumn(testData2);
      _showColumn(testData2);
    });

    it("should be able to show and hide columns in a multi-stage query with custom columns (metabase#35067)", () => {
      H.createQuestion(
        {
          query: {
            "source-query": {
              "source-table": ORDERS_ID,
              aggregation: [["count"]],
              breakout: [
                [
                  "field",
                  PRODUCTS.ID,
                  {
                    "base-type": "type/Integer",
                    "source-field": ORDERS.PRODUCT_ID,
                  },
                ],
              ],
            },
            expressions: {
              CC: ["*", 2, ["field", "count", { "base-type": "type/Integer" }]],
            },
            limit: 5,
          },
        },
        { visitQuestion: true },
      );
      openSettings();

      const countColumn = {
        column: "Count",
        columnName: "Count",
        table: "summaries",
        sanityCheck: "CC",
        needsScroll: false,
      };

      const productIdColumn = {
        column: "Product → ID",
        columnName: "Product → ID",
        table: "summaries",
        sanityCheck: "Count",
        needsScroll: false,
      };

      const customColumn = {
        column: "CC",
        columnName: "CC",
        table: "summaries",
        sanityCheck: "Count",
        needsScroll: false,
      };

      _hideColumn(countColumn);
      _showColumn(countColumn);
      _removeColumn(countColumn);
      _addColumn(countColumn);
      _hideColumn(productIdColumn);
      _showColumn(productIdColumn);
      _removeColumn(productIdColumn);
      _addColumn(productIdColumn);
      _hideColumn(customColumn);
      _showColumn(customColumn);
    });
  });

  describe("nested structured questions", () => {
    it("should be able to show and hide fields from a nested query", () => {
      H.createQuestion(tableQuestion).then(({ body: card }) => {
        H.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      const testData = {
        column: "Tax",
        columnName: "Tax",
        table: "test question",
      };

      _hideColumn(testData);
      _showColumn(testData);
      _removeColumn(testData);
      _addColumn(testData);
    });

    it("should be able to show and hide fields from a nested query with joins (metabase#32373)", () => {
      H.createQuestion(tableQuestionWithJoin).then(({ body: card }) => {
        H.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      const testData = {
        column: "Products → Category",
        columnName: "Products → Category",
        table: "test question",
      };

      _hideColumn(testData);
      _showColumn(testData);
      _removeColumn(testData);
      _addColumn(testData);
    });

    it("should be able to show and hide fields from a nested query with joins and fields (metabase#32373)", () => {
      H.createQuestion(tableQuestionWithJoinAndFields).then(
        ({ body: card }) => {
          H.createQuestion(nestedQuestion(card), { visitQuestion: true });
        },
      );
      openSettings();

      const testData = {
        column: "Products → Category",
        columnName: "Products → Category",
        table: "test question",
        scrollTimes: 3,
      };

      const testData2 = {
        column: "Ean",
        columnName: "Product → Ean",
        table: "product",
        scrollTimes: 3,
      };

      _hideColumn(testData);
      _removeColumn(testData);

      _addColumn(testData2);

      _addColumn(testData);
    });

    it("should be able to show and hide implicitly joinable fields for a nested query with joins and fields", () => {
      H.createQuestion(tableQuestion).then(({ body: card }) => {
        H.createQuestion(nestedQuestionWithJoinOnTable(card), {
          visitQuestion: true,
        });
      });
      openSettings();

      const newColumn = {
        column: "ID",
        columnName: "User → ID",
        table: "user",
        scrollTimes: 3,
      };

      _addColumn(newColumn);
      _hideColumn(newColumn);
      _removeColumn(newColumn);
    });

    it("should be able to show and hide implicitly joinable fields for a nested query", () => {
      H.createQuestion(tableQuestion).then(({ body: card }) => {
        H.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      const newColumn = {
        column: "Category",
        columnName: "Product → Category",
        table: "product",
      };

      _addColumn(newColumn);
      _hideColumn(newColumn);
      _removeColumn(newColumn);
    });

    it("should be able to show and hide custom expressions from a nested query", () => {
      H.createQuestion(tableQuestionWithExpression).then(({ body: card }) => {
        H.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      const mathColumn = {
        column: "Math",
        columnName: "Math",
        table: "test question",
        needsScroll: false,
      };

      _hideColumn(mathColumn);
      _showColumn(mathColumn);
      _removeColumn(mathColumn);
      _addColumn(mathColumn);
    });

    it("should be able to show and hide columns from aggregations from a nested query", () => {
      H.createQuestion(tableWithAggregations).then(({ body: card }) => {
        H.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      const countColumn = {
        column: "Count",
        columnName: "Count",
        table: "test question",
        needsScroll: false,
      };

      const sumColumn = {
        column: "Sum of Quantity",
        columnName: "Sum of Quantity",
        table: "test question",
        needsScroll: false,
      };

      _hideColumn(countColumn);
      _showColumn(countColumn);
      _hideColumn(sumColumn);
      _showColumn(sumColumn);
    });

    it("should be able to show and hide columns from a nested query with a self join", () => {
      H.createQuestion(tableQuestion).then(({ body: card }) => {
        H.createQuestion(nestedQuestionWithJoinOnQuestion(card), {
          visitQuestion: true,
        });
        openSettings();

        const taxColumn = {
          column: `Question ${card.id} → Tax`,
          columnName: `Question ${card.id} → Tax`,
          table: "test question 2",
          scrollTimes: 3,
        };

        _hideColumn(taxColumn);
        _showColumn(taxColumn);
        _removeColumn(taxColumn);
        _addColumn(taxColumn);
      });
    });

    it("should be able to show and hide custom expressions from a joined question", () => {
      H.createQuestion(tableQuestionWithExpression).then(({ body: card }) => {
        H.createQuestion(tableQuestionWithJoinOnQuestion(card), {
          visitQuestion: true,
        });

        openSettings();

        const mathColumn = {
          column: `Question ${card.id} → Math`,
          columnName: `Question ${card.id} → Math`,
          table: "test question",
          needsScroll: false,
        };

        _hideColumn(mathColumn);
        _showColumn(mathColumn);
        _removeColumn(mathColumn);
        _addColumn(mathColumn);
      });
    });

    it("should be able to show a column from a nested query when it was hidden in the notebook editor", () => {
      H.createQuestion(tableQuestion).then(({ body: card }) => {
        H.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });

      H.openNotebook();
      cy.findByTestId("fields-picker").click();
      H.popover().findByText("Tax").click();
      H.visualize();

      openSettings();

      const taxColumn = {
        column: "Tax",
        columnName: "Tax",
        table: "test question",
      };

      _addColumn(taxColumn);
    });
  });

  describe("nested native questions", () => {
    it("should be able to show and hide fields from a nested native query", () => {
      H.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        H.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      const taxColumn = {
        column: "TAX",
        columnName: "TAX",
        table: "test question",
      };

      _hideColumn(taxColumn);
      _showColumn(taxColumn);
      _removeColumn(taxColumn);
      _addColumn(taxColumn);
    });

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

  describe("issue 28304", () => {
    const questionDetails = {
      name: "28304",
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
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

  describe("issue 28311", () => {
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
      cy.signInAsAdmin();

      H.visitQuestionAdhoc(questionDetails);
    });

    it("should move a column to a new position on the first drag (metabase#28311)", () => {
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Product ID").should("be.visible");

      H.openVizSettingsSidebar();
      H.getDraggableElements().contains("Product ID").as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", {
        vertical: -100,
        useMouseEvents: true,
      });
      H.getDraggableElements().eq(0).should("contain", "Product ID");
    });
  });

  describe("issue 42049", () => {
    beforeEach(() => {
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

      // A dirty question runs through /api/dataset, so give it the same named field ref.
      cy.intercept("POST", "/api/dataset", (req) => {
        req.on("response", (res) => {
          const createdAt = res.body.data.cols[1];

          createdAt.field_ref[1] = "created_at"; // simulate named field ref

          res.send();
        });
      }).as("dataset");

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

      cy.wait("@dataset");
      H.queryBuilderFiltersPanel()
        .findByTestId("filter-pill")
        .should("contain", "Created At");

      cy.log("verify columns order after applying the filter");

      cy.findAllByTestId("header-cell").as("headerCells");
      cy.get("@headerCells").eq(0).should("have.text", "ID");
      cy.get("@headerCells").eq(1).should("have.text", "Created At");
      cy.get("@headerCells").eq(2).should("have.text", "Quantity");
    });
  });

  it("should handle duplicated values in table.columns viz settings (metabase#62053)", () => {
    const nativeQuestionWithDuplicatedColumns = {
      display: "table",
      native: {
        query: "SELECT ID, TAX FROM ORDERS LIMIT 5",
      },
      visualization_settings: {
        "table.columns": [
          {
            name: "ID",
            enabled: true,
          },
          // Duplicate ID column entry
          {
            name: "ID",
            enabled: true,
          },
          {
            name: "TAX",
            enabled: true,
          },
        ],
      },
    };

    H.createNativeQuestion(nativeQuestionWithDuplicatedColumns, {
      visitQuestion: true,
    });

    // Verify the table renders correctly despite duplicated viz settings
    visualization().should("be.visible");

    // Verify expected columns are visible
    visualization().findAllByText("ID").should("have.length", 1);
    visualization().findByText("TAX").should("exist");

    // Open settings to verify column settings work
    openSettings();

    // Verify that column controls are displayed correctly
    visibleColumns()
      .should("exist")
      .within(() => {
        cy.findByText("ID").should("exist");
        cy.findByTestId("ID-hide-button").should("exist");

        cy.findByText("TAX").should("exist");
        cy.findByTestId("TAX-hide-button").should("exist");
      });
  });

  describe("column pinning", () => {
    describe("column reordering between pinned and unpinned sections", () => {
      it("should allow reordering a column from the unpinned section into the pinned section", () => {
        H.createQuestion(
          {
            query: { "source-table": ORDERS_ID },
            visualization_settings: {
              "table.freeze_columns": true,
              "table.freeze_columns_count": 1,
            },
          },
          { visitQuestion: true },
        );

        cy.findByTestId("header-pinned-quadrant")
          .findAllByTestId("header-cell")
          .should("have.length", 1)
          .first()
          .should("contain.text", "ID");

        H.tableHeaderColumn("User ID").as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", { horizontal: -50 });

        cy.findByTestId("header-pinned-quadrant")
          .findAllByTestId("header-cell")
          .should("have.length", 1)
          .first()
          .should("contain.text", "User ID");
      });

      it("should allow reordering a column from the pinned section into the unpinned section", () => {
        H.createQuestion(
          {
            query: { "source-table": ORDERS_ID },
            visualization_settings: {
              "table.freeze_columns": true,
              "table.freeze_columns_count": 2,
            },
          },
          { visitQuestion: true },
        );

        cy.findByTestId("header-pinned-quadrant")
          .findAllByTestId("header-cell")
          .should("have.length", 2)
          .then((cells) => {
            expect(cells.eq(0)).to.contain("ID");
            expect(cells.eq(1)).to.contain("User ID");
          });

        H.tableHeaderColumn("ID").as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", { horizontal: 400 });

        cy.findByTestId("header-pinned-quadrant")
          .findAllByTestId("header-cell")
          .then((cells) => {
            expect(cells.eq(0)).to.contain("User ID");
            expect(cells.eq(1)).to.contain("Product ID");
          });
      });
    });

    describe("column resizing with pinning limits", () => {
      it("should unpin/re-pin the last pinned column when resizing exceeds/fits 90% of container width", () => {
        H.createQuestion(
          {
            query: { "source-table": ORDERS_ID },
            visualization_settings: {
              "table.freeze_columns": true,
              "table.freeze_columns_count": 4,
            },
          },
          { visitQuestion: true },
        );

        cy.findByTestId("header-pinned-quadrant")
          .findAllByTestId("header-cell")
          .should("have.length", 4);

        cy.findByTestId("table-scroll-container")
          .invoke("width")
          .then((containerWidth) => {
            const moveX = containerWidth * 0.7;
            H.resizeTableColumn("ID", moveX);

            cy.findByTestId("header-pinned-quadrant")
              .findAllByTestId("header-cell")
              .should("have.length", 2);

            H.resizeTableColumn("ID", -moveX);

            cy.findByTestId("header-pinned-quadrant")
              .findAllByTestId("header-cell")
              .should("have.length", 4);

            // allow resizing columns in the pinned section without affecting pinning when within limits
            H.resizeTableColumn("ID", 30);
            cy.findByTestId("header-pinned-quadrant")
              .findAllByTestId("header-cell")
              .should("have.length", 4);
          });
      });
    });
  });

  it("should respect date_style column setting for week temporal unit", () => {
    const questionWithWeekBreakout = {
      display: "table",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        limit: 5,
      },
    };

    H.createQuestion(questionWithWeekBreakout, { visitQuestion: true });

    // Open visualization settings
    H.openVizSettingsSidebar();

    // Click on the "Created At: Week" column to open its settings
    H.leftSidebar().findByTestId("Created At: Week-settings-button").click();

    // Change date style to M/D/YYYY
    H.popover().findByText("Date style").click();
    H.popover()
      .findByText(/^1\/31\/2018/)
      .click();

    // Verify the formatting changed to numeric style
    H.tableInteractiveBody().within(() => {
      cy.findAllByTestId("cell-data")
        .first()
        .invoke("text")
        .should("match", /\d+\/\d+\/\d{4} – \d+\/\d+\/\d{4}/); // Format like "1/1/2025 - 1/7/2025"
    });

    // Change date style to YYYY/M/D
    H.popover().findByText("Date style").click();
    H.popover()
      .findByText(/^2018\/1\/31/)
      .click();

    // Verify the formatting changed to day-first numeric style
    H.tableInteractiveBody().within(() => {
      cy.findAllByTestId("cell-data")
        .first()
        .invoke("text")
        .should("match", /\d{4}\/\d+\/\d+ – \d{4}\/\d+\/\d+/); // Format like "2025/1/1 - 2025/1/7"
    });

    H.popover().findByText("YYYY.M.D").click();
    // Verify separator formatting changed
    H.tableInteractiveBody().within(() => {
      cy.findAllByTestId("cell-data")
        .first()
        .invoke("text")
        .should("match", /\d{4}\.\d+\.\d+ – \d{4}\.\d+\.\d+/); // Format like "2025.1.1 - 2025.1.7"
    });
  });
});

const showColumn = (column) => {
  cy.findByTestId(`${column}-show-button`).click();
};

const hideColumn = (column) => {
  cy.findByTestId(`${column}-hide-button`).click();
};

const openSettings = () => {
  H.openVizSettingsSidebar();
};

const visualization = () => {
  return H.tableInteractive();
};

const scrollVisualization = (position = "right") => {
  H.tableInteractiveScrollContainer().scrollTo(position, {
    force: true,
  });
};

const visibleColumns = () => {
  return cy.findByTestId("visible-columns");
};

const getColumn = (columnName) => {
  return visibleColumns().contains("[role=listitem]", columnName);
};

const assertColumnEnabled = (column) => {
  column.should("have.attr", "data-enabled", "true");
};

const assertColumnHidden = (column) => {
  column.should("have.attr", "data-enabled", "false");
};
