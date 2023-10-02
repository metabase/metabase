import { openNotebook, popover, restore, visualize } from "e2e/support/helpers";
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

const tableQuestionWithJoinOnQuestion = card => ({
  display: "table",
  query: {
    "source-table": ORDERS_ID,
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

const nestedQuestion = card => ({
  display: "table",
  query: {
    "source-table": `card__${card.id}`,
  },
  limit: 5,
});

const nestedQuestionWithJoinOnTable = card => ({
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

const nestedQuestionWithJoinOnQuestion = card => ({
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

const scenarios = [
  // {
  //   name: "table fields",
  //   question: tableQuestion,
  //   existingColumns: [{ column: "Tax", columnName: "Tax" }],
  //   sanityCheck: "ID",
  // },
  // {
  //   name: "table fields with in a join",
  //   question: tableQuestionWithJoin,
  //   existingColumns: [{ column: "Rating", columnName: "Products → Rating" }],
  //   sanityCheck: "Products → Ean",
  // },
  // {
  //   name: "Table fields with a self join",
  //   question: tableQuestionWithSelfJoinAndFields,
  //   existingColumns: [{ column: "Tax", columnName: "Orders → Tax" }],
  //   sanityCheck: "ID",
  // },
  // {
  //   name: "table fields with implicit joins",
  //   question: tableQuestion,
  //   existingColumns: [],
  //   extraColumns: [{ column: "Category", columnName: "Product → Category" }],
  //   sanityCheck: "ID",
  // },
  // {
  //   name: "table with custom expressions",
  //   question: tableQuestionWithExpression,
  //   existingColumns: [{ column: "Math", columnName: "Math" }],
  // },
  // {
  //   name: "table with custom expressions and fields",
  //   question: tableQuestionWithExpressionAndFields,
  //   existingColumns: [{ column: "Math", columnName: "Math" }],
  // },
  // {
  //   name: "table with aggregrations",
  //   question: tableWithAggregations,
  //   existingColumns: [{ column: "Count", columnName: "Count" }],
  //   needsScroll: false,
  // },
  // {
  //   name: "multistage question",
  //   question: multiStageQuestion,
  //   existingColumns: [{ column: "Count", columnName: "Count" }],
  //   sanityCheck: "Product ID",
  // },
  // {
  //   name: "nested question",
  //   question: () => {
  //     cy.createQuestion(tableQuestion).then(({ body: card }) => {
  //       cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
  //     });
  //   },
  //   existingColumns: [{ column: "Tax", columnName: "Tax" }],
  // },
  // {
  //   name: "nested question with joins",
  //   question: () => {
  //     cy.createQuestion(tableQuestionWithJoin).then(({ body: card }) => {
  //       cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
  //     });
  //   },
  //   existingColumns: [
  //     { column: "Products → Ean", columnName: "Products → Ean" },
  //   ],
  // },
  // {
  //   name: "nested question qith join and fields",
  //   question: () => {
  //     cy.createQuestion(tableQuestionWithJoinAndFields).then(
  //       ({ body: card }) => {
  //         cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
  //       },
  //     );
  //   },
  //   existingColumns: [
  //     { column: "Products → Category", columnName: "Products → Category" },
  //   ],
  // },
  // {
  //   name: "show and hide implicitly joinable fields for a nested query with joins and fields",
  //   question: () => {
  //     cy.createQuestion(tableQuestion).then(({ body: card }) => {
  //       cy.createQuestion(nestedQuestionWithJoinOnTable(card), {
  //         visitQuestion: true,
  //       });
  //     });
  //   },
  //   extraColumns: [{ column: "ID", columnName: "User → ID", table: "user" }],
  // },
  // {
  //   name: "show and hide implicitly joinable fields for a nested query",
  //   question: () => {
  //     cy.createQuestion(tableQuestion).then(({ body: card }) => {
  //       cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
  //     });
  //   },
  //   extraColumns: [
  //     {
  //       column: "Category",
  //       columnName: "Product → Category",
  //       table: "product",
  //     },
  //   ],
  // },
  // {
  //   name: "show and hide custom expressions from a nested query",
  //   question: () => {
  //     cy.createQuestion(tableQuestionWithExpression).then(({ body: card }) => {
  //       cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
  //     });
  //   },
  //   existingColumns: [
  //     { column: "Math", columnName: "Math", table: "test question" },
  //   ],
  // },
  // {
  //   name: "show and hide columns from aggregations from a nested query",
  //   question: () => {
  //     cy.createQuestion(tableWithAggregations).then(({ body: card }) => {
  //       cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
  //     });
  //   },
  //   existingColumns: [
  //     { column: "Count", columnName: "Count", table: "test question" },
  //     {
  //       column: "Sum of Quantity",
  //       columnName: "Sum of Quantity",
  //       table: "test question",
  //     },
  //   ],
  //   needsScroll: false,
  // },
  // {
  //   name: "show and hide columns from aggregations from a nested query",
  //   question: () => {
  //     cy.createQuestion(tableQuestion, { wrapId: true }).then(
  //       ({ body: card }) => {
  //         cy.get("@questionId").then(id => {
  //           cy.createQuestion(nestedQuestionWithJoinOnQuestion({ id }), {
  //             visitQuestion: true,
  //           });
  //         });
  //       },
  //     );
  //   },
  //   existingColumns: cardId => [
  //     {
  //       column: "Tax",
  //       columnName: `Question ${cardId} → Tax`,
  //       table: `question ${cardId}`,
  //     },
  //   ],
  // },
];

describe("scenarios > visualizations > table column settings", () => {
  beforeEach(() => {
    restore();
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
      [...Array(scrollTimes)].forEach(() => {
        scrollVisualization();
        cy.wait(200);
      });
    }
    visualization().findByText(columnName).should("not.exist");

    cy.findByRole("button", { name: /Add or remove columns/ }).click();
    cy.findByRole("list", { name: `${table}-table-columns` })
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
      [...Array(scrollTimes)].forEach(() => {
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
    cy.findByRole("list", { name: `${table}-table-columns` })
      .findByLabelText(column)
      .should("be.checked")
      .click();
    runQuery();
    cy.wait("@dataset");
    cy.findByText("Doing science...").should("not.exist");
    if (needsScroll) {
      [...Array(scrollTimes)].forEach(() => {
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
    cy.findByRole("list", { name: `${table}-table-columns` })
      .findByLabelText(column)
      .should("not.be.checked")
      .click();
    cy.wait("@dataset");
    cy.findByText("Doing science...").should("not.exist");
    if (needsScroll) {
      [...Array(scrollTimes)].forEach(() => {
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
      cy.createQuestion(tableQuestion, { visitQuestion: true });
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

      // cy.log("hide a column");
      // visibleColumns().within(() => hideColumn("Tax"));
      // visibleColumns().findByText("Tax").should("not.exist");
      // visibleColumns().findByText("ID").should("exist");
      // disabledColumns().findByText("Tax").should("exist");
      // additionalColumns().findByText("Tax").should("not.exist");
      // visualization().findByText("Tax").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // visualization().findByText("Tax").should("not.exist");

      // cy.log("show a column");
      // additionalColumns().within(() => showColumn("Tax"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Tax").should("exist");
      // visibleColumns().findByText("ID").should("exist");
      // disabledColumns().findByText("Tax").should("not.exist");
      // additionalColumns().findByText("Tax").should("not.exist");
      // scrollVisualization();
      // visualization().findByText("Tax").should("exist");
    });

    // scenarios.forEach(scenario => {
    //   it.only(`should be able to show, hide, add and remove columns - ${scenario.name}`, () => {
    //     const {
    //       question,
    //       existingColumns = [],
    //       extraColumns = [],
    //       sanityCheck,
    //       needsScroll = true,
    //     } = scenario;

    //     if (typeof question === "function") {
    //       question();
    //     } else {
    //       cy.createQuestion(question, { visitQuestion: true });
    //     }

    //     openSettings();

    //     let cardId;

    //     cy.get("@questionId").then(questionId => {
    //       cardId = questionId;
    //       cy.log(cardId);
    //       cy.log(questionId);
    //     });

    //     cy.log(cardId);

    //     const _existingColumns =
    //       typeof existingColumns === "function"
    //         ? existingColumns(cardId)
    //         : existingColumns;

    //     _existingColumns.forEach(existingColumn => {
    //       const { column, columnName, table } = existingColumn;
    //       cy.log("hide the column");
    //       visibleColumns().within(() => hideColumn(columnName));
    //       assertColumnHidden(getColumn(columnName));
    //       if (sanityCheck) {
    //         assertColumnEnabled(getColumn(sanityCheck));
    //       }
    //       if (needsScroll) {
    //         scrollVisualization();
    //       }
    //       visualization().findByText(columnName).should("not.exist");

    //       cy.findByRole("button", { name: /Add or remove columns/ }).click();
    //       cy.findByRole("list", { name: `${table}-table-columns` })
    //         .findByLabelText(column)
    //         .should("be.checked");
    //       cy.findByRole("button", { name: /Done picking columns/ }).click();

    //       cy.log("show the column");
    //       visibleColumns().within(() => showColumn(columnName));
    //       assertColumnEnabled(getColumn(columnName));
    //       if (sanityCheck) {
    //         assertColumnEnabled(getColumn(sanityCheck));
    //       }
    //       if (needsScroll) {
    //         scrollVisualization();
    //       }
    //       visualization().findByText(columnName).should("exist");

    //       cy.log("remove the column");
    //       cy.findByRole("button", { name: /Add or remove columns/ }).click();
    //       cy.findByRole("list", { name: `${table}-table-columns` })
    //         .findByLabelText(column)
    //         .should("be.checked")
    //         .click();
    //       runQuery();
    //       cy.wait("@dataset");
    //       cy.findByText("Doing science...").should("not.exist");
    //       if (needsScroll) {
    //         scrollVisualization();
    //       }
    //       visualization().findByText(columnName).should("not.exist");
    //       cy.findByRole("button", { name: /Done picking columns/ }).click();
    //       getColumn(columnName).should("not.exist");
    //       if (sanityCheck) {
    //         assertColumnEnabled(getColumn(sanityCheck));
    //       }

    //       cy.log("add the column");
    //       cy.findByRole("button", { name: /Add or remove columns/ }).click();
    //       cy.findByRole("list", { name: `${table}-table-columns` })
    //         .findByLabelText(column)
    //         .should("not.be.checked")
    //         .click();
    //       cy.wait("@dataset");
    //       cy.findByText("Doing science...").should("not.exist");
    //       if (needsScroll) {
    //         scrollVisualization();
    //       }
    //       visualization().findByText(columnName).should("exist");
    //       cy.findByRole("button", { name: /Done picking columns/ }).click();
    //       assertColumnEnabled(getColumn(columnName));
    //       if (sanityCheck) {
    //         assertColumnEnabled(getColumn(sanityCheck));
    //       }
    //     });

    //     extraColumns.forEach(extraColumn => {
    //       const { column, columnName, table } = extraColumn;
    //       getColumn(columnName).should("not.exist");

    //       cy.log("add the column");
    //       cy.findByRole("button", { name: /Add or remove columns/ }).click();
    //       cy.findByRole("list", { name: `${table}-table-columns` })
    //         .findByLabelText(column)
    //         .should("not.be.checked")
    //         .click();
    //       cy.wait("@dataset");
    //       cy.findByText("Doing science...").should("not.exist");
    //       if (needsScroll) {
    //         scrollVisualization();
    //         cy.wait(200);
    //         scrollVisualization();
    //         cy.wait(200);
    //         scrollVisualization();
    //       }
    //       visualization().findByText(columnName).should("exist");
    //       cy.findByRole("button", { name: /Done picking columns/ }).click();
    //       assertColumnEnabled(getColumn(columnName));
    //       if (sanityCheck) {
    //         assertColumnEnabled(getColumn(sanityCheck));
    //       }

    //       cy.log("hide the column");
    //       visibleColumns().within(() => hideColumn(columnName));
    //       assertColumnHidden(getColumn(columnName));
    //       if (sanityCheck) {
    //         assertColumnEnabled(getColumn(sanityCheck));
    //       }
    //       if (needsScroll) {
    //         scrollVisualization();
    //       }
    //       visualization().findByText(columnName).should("not.exist");

    //       cy.findByRole("button", { name: /Add or remove columns/ }).click();
    //       cy.findByRole("list", { name: `${table}-table-columns` })
    //         .findByLabelText(column)
    //         .should("be.checked");
    //       cy.findByRole("button", { name: /Done picking columns/ }).click();

    //       cy.log("show the column");
    //       visibleColumns().within(() => showColumn(columnName));
    //       assertColumnEnabled(getColumn(columnName));
    //       if (sanityCheck) {
    //         assertColumnEnabled(getColumn(sanityCheck));
    //       }
    //       if (needsScroll) {
    //         scrollVisualization();
    //       }
    //       visualization().findByText(columnName).should("exist");

    //       cy.log("remove the column");
    //       cy.findByRole("button", { name: /Add or remove columns/ }).click();
    //       cy.findByRole("list", { name: `${table}-table-columns` })
    //         .findByLabelText(column)
    //         .should("be.checked")
    //         .click();
    //       runQuery();
    //       cy.wait("@dataset");
    //       if (needsScroll) {
    //         scrollVisualization();
    //       }
    //       visualization().findByText(columnName).should("not.exist");
    //       cy.findByRole("button", { name: /Done picking columns/ }).click();
    //       getColumn(columnName).should("not.exist");
    //       if (sanityCheck) {
    //         assertColumnEnabled(getColumn(sanityCheck));
    //       }
    //     });
    //   });
    // });

    it("should be able to rename table columns via popover", () => {
      cy.createQuestion(tableQuestion, { visitQuestion: true });

      cy.findByTestId("TableInteractive-root").within(() => {
        cy.findByText("Product ID").click();
      });

      popover().within(() => {
        cy.icon("gear").click();
        cy.findByDisplayValue("Product ID").clear().type("prod_id");
      });

      // clicking outside of the popover to close it
      cy.findByTestId("app-bar").click();

      cy.findByTestId("TableInteractive-root").within(() => {
        cy.findByText("prod_id");
      });
    });

    it("should be able to show and hide table fields with in a join", () => {
      cy.createQuestion(tableQuestionWithJoin, { visitQuestion: true });
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

      // cy.log("hide a column");
      // visibleColumns().within(() => hideColumn("Products → Category"));
      // visibleColumns().findByText("Products → Category").should("not.exist");
      // visibleColumns().findByText("Products → Ean").should("exist");
      // disabledColumns().findByText("Products → Category").should("exist");
      // additionalColumns().findByText("Category").should("not.exist");
      // visualization().findByText("Products → Category").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // visualization().findByText("Products → Category").should("not.exist");

      // cy.log("show a column");
      // additionalColumns().within(() => showColumn("Category"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Products → Category").should("exist");
      // visibleColumns().findByText("Products → Ean").should("exist");
      // disabledColumns().findByText("Category").should("not.exist");
      // additionalColumns().findByText("Category").should("not.exist");
      // scrollVisualization();
      // visualization().findByText("Products → Category").should("exist");
    });

    it("should be able to show and hide table fields with a join with fields", () => {
      cy.createQuestion(tableQuestionWithJoinAndFields, {
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

      // cy.log("hide an existing column");
      // visibleColumns().within(() => hideColumn("Products → Category"));
      // visibleColumns().findByText("Products → Category").should("not.exist");
      // visibleColumns().findByText("Products → Ean").should("not.exist");
      // disabledColumns().findByText("Products → Category").should("exist");
      // additionalColumns().findByText("Category").should("not.exist");
      // visualization().findByText("Products → Category").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // visualization().findByText("Products → Category").should("not.exist");

      // cy.log("show an existing column");
      // additionalColumns().within(() => showColumn("Ean"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Products → Ean").should("exist");
      // visibleColumns().findByText("Products → Category").should("not.exist");
      // disabledColumns().findByText("Products → Ean").should("not.exist");
      // additionalColumns().findByText("Ean").should("not.exist");
      // additionalColumns().findByText("Category").should("exist");
      // scrollVisualization();
      // visualization().findByText("Products → Ean").should("exist");

      // cy.log("show a new column");
      // additionalColumns().within(() => showColumn("Category"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Products → Ean").should("exist");
      // visibleColumns().findByText("Products → Category").should("exist");
      // additionalColumns().findByText("Ean").should("not.exist");
      // additionalColumns().findByText("Category").should("not.exist");
      // additionalColumns().findByText("Rating").should("exist");
      // scrollVisualization();
      // visualization().findByText("Products → Category").should("exist");
    });

    it("should be able to show and hide table fields with a self join with fields", () => {
      cy.createQuestion(tableQuestionWithSelfJoinAndFields, {
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

<<<<<<< HEAD
      cy.log("show the column");
      additionalColumns().within(() => showColumn("Tax"));
      cy.wait("@dataset");
      visibleColumns().findByText("Orders → Tax").should("exist");
      visibleColumns().findByText("Tax").should("exist");
      disabledColumns().findByText("Orders → Tax").should("not.exist");
      disabledColumns().findByText("Tax").should("not.exist");
      additionalColumns().findByText("Tax").should("not.exist");
      visualization().findByText("Orders → Tax").should("exist");
=======
      // cy.log("hide an existing column");
      // visibleColumns().within(() => hideColumn("Orders → Tax"));
      // visibleColumns().findByText("Tax").should("exist");
      // visibleColumns().findByText("Orders → Tax").should("not.exist");
      // disabledColumns().findByText("Tax").should("not.exist");
      // disabledColumns().findByText("Orders → Tax").should("exist");
      // additionalColumns().findByText("Tax").should("not.exist");
      // visualization().findByText("Orders → Tax").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // visibleColumns().findByText("Tax").should("exist");
      // disabledColumns().findByText("Tax").should("not.exist");
      // disabledColumns().findByText("Orders → Tax").should("not.exist");
      // additionalColumns().findByText("Tax").should("exist");
      // visualization().findByText("Orders → Tax").should("not.exist");

      // cy.log("show the column");
      // additionalColumns().within(() => showColumn("Tax"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Orders → Tax").should("exist");
      // visibleColumns().findByText("Tax").should("exist");
      // disabledColumns().findByText("Orders → Tax").should("not.exist");
      // disabledColumns().findByText("Tax").should("not.exist");
      // additionalColumns().findByText("Tax").should("not.exist");
      // scrollVisualization();
      // visualization().findByText("Orders → Tax").should("exist");
>>>>>>> 97d973099a (e2e tests passing)
    });

    it("should be able to show and hide implicitly joinable fields for a table", () => {
      cy.createQuestion(tableQuestion, { visitQuestion: true });
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

      //   cy.log("show a column");
      //   additionalColumns().within(() => showColumn("Category"));
      //   cy.wait("@dataset");
      //   visibleColumns().findByText("Product → Category").should("exist");
      //   additionalColumns().findByText("Category").should("not.exist");
      //   scrollVisualization();
      //   visualization().findByText("Product → Category").should("exist");

      //   cy.log("hide a column");
      //   visibleColumns().within(() => hideColumn("Product → Category"));
      //   visibleColumns().findByText("Product → Category").should("not.exist");
      //   disabledColumns().findByText("Product → Category").should("exist");
      //   additionalColumns().findByText("Category").should("not.exist");
      //   scrollVisualization();
      //   visualization().findByText("Product → Category").should("not.exist");

      //   cy.log("re-run the query");
      //   runQuery();
      //   cy.wait("@dataset");
      //   visibleColumns().findByText("Product → Category").should("not.exist");
      //   disabledColumns().findByText("Product → Category").should("not.exist");
      //   additionalColumns().findByText("Category").should("exist");
      //   scrollVisualization();
      //   visualization().findByText("Product → Category").should("not.exist");
    });

    it("should be able to show and hide custom expressions for a table", () => {
      cy.createQuestion(tableQuestionWithExpression, {
        visitQuestion: true,
      });
      openSettings();

      const testData = {
        column: "Math",
        columnName: "Math",
        table: "orders",
      };

      _hideColumn(testData);
      _showColumn(testData);
      _removeColumn(testData);
      _addColumn(testData);

      // cy.log("hide a column");
      // visibleColumns().within(() => hideColumn("Math"));
      // visibleColumns().findByText("Math").should("not.exist");
      // disabledColumns().findByText("Math").should("exist");
      // scrollVisualization();
      // visualization().findByText("Math").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // scrollVisualization();
      // visualization().findByText("Math").should("not.exist");

      // cy.log("show a column");
      // additionalColumns().within(() => showColumn("Math"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Math").should("exist");
      // additionalColumns().findByText("Math").should("not.exist");
      // scrollVisualization();
      // visualization().findByText("Math").should("exist");
    });

    it("should be able to show and hide custom expressions for a table with selected fields", () => {
      cy.createQuestion(tableQuestionWithExpressionAndFields, {
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
      _removeColumn(testData);
      _addColumn(testData);

      // cy.log("hide a column");
      // visibleColumns().within(() => hideColumn("Math"));
      // visibleColumns().findByText("Math").should("not.exist");
      // disabledColumns().findByText("Math").should("exist");
      // visualization().findByText("Math").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // visualization().findByText("Math").should("not.exist");

      // cy.log("show a column");
      // additionalColumns().within(() => showColumn("Math"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Math").should("exist");
      // additionalColumns().findByText("Math").should("not.exist");
      // visualization().findByText("Math").should("exist");
    });

    it("should be able to show and hide columns from aggregations", () => {
      cy.createQuestion(tableWithAggregations, { visitQuestion: true });
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

      //   cy.log("hide a column");
      //   visibleColumns().within(() => hideColumn("Count"));
      //   visibleColumns().findByText("Count").should("not.exist");
      //   visibleColumns().findByText("Sum of Quantity").should("exist");
      //   disabledColumns().findByText("Count").should("exist");
      //   visualization().findByText("Count").should("not.exist");

      //   cy.log("show a column");
      //   disabledColumns().within(() => showColumn("Count"));
      //   visibleColumns().findByText("Count").should("exist");
      //   visibleColumns().findByText("Sum of Quantity").should("exist");
      //   visualization().findByText("Count").should("exist");

      //   cy.log("hide a column with an inner field");
      //   visibleColumns().within(() => hideColumn("Sum of Quantity"));
      //   visibleColumns().findByText("Sum of Quantity").should("not.exist");
      //   visibleColumns().findByText("Count").should("exist");
      //   disabledColumns().findByText("Sum of Quantity").should("exist");
      //   visualization().findByText("Sum of Quantity").should("not.exist");

      //   cy.log("show a column with an inner field");
      //   disabledColumns().within(() => showColumn("Sum of Quantity"));
      //   visibleColumns().findByText("Sum of Quantity").should("exist");
      //   visibleColumns().findByText("Count").should("exist");
      //   visualization().findByText("Sum of Quantity").should("exist");
    });
  });

  describe("multi-stage questions", () => {
    it("should be able to show and hide table fields in a multi-stage query", () => {
      cy.createQuestion(multiStageQuestion, { visitQuestion: true });
      openSettings();

      const testData = {
        column: "Count",
        columnName: "Count",
        table: "question",
        sanityCheck: "Product ID",
        needsScroll: false,
      };

      const testData2 = {
        column: "Product ID",
        columnName: "Product ID",
        table: "question",
        sanityCheck: "Count",
        needsScroll: false,
      };

      _hideColumn(testData);
      _showColumn(testData);
      _hideColumn(testData2);
      _showColumn(testData2);

      // cy.log("hide an aggregation column");
      // visibleColumns().within(() => hideColumn("Count"));
      // visibleColumns().findByText("Count").should("not.exist");
      // visibleColumns().findByText("Product ID").should("exist");
      // disabledColumns().findByText("Count").should("exist");
      // additionalColumns().findByText("Count").should("not.exist");
      // visualization().findByText("Count").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // visualization().findByText("Count").should("not.exist");

      // cy.log("show an aggregation column");
      // additionalColumns().within(() => showColumn("Count"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Count").should("exist");
      // visibleColumns().findByText("Product ID").should("exist");
      // disabledColumns().findByText("Count").should("not.exist");
      // additionalColumns().findByText("Count").should("not.exist");
      // visualization().findByText("Count").should("exist");

      // cy.log("hide a breakout column");
      // visibleColumns().within(() => hideColumn("Product ID"));
      // visibleColumns().findByText("Product ID").should("not.exist");
      // visibleColumns().findByText("Count").should("exist");
      // disabledColumns().findByText("Product ID").should("exist");
      // additionalColumns().findByText("Product ID").should("not.exist");
      // visualization().findByText("Product ID").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // visualization().findByText("Product ID").should("not.exist");

      // cy.log("show a breakout column");
      // additionalColumns().within(() => showColumn("Product ID"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Product ID").should("exist");
      // visibleColumns().findByText("Count").should("exist");
      // disabledColumns().findByText("Product ID").should("not.exist");
      // additionalColumns().findByText("Product ID").should("not.exist");
      // visualization().findByText("Product ID").should("exist");
    });
  });

  describe("nested structured questions", () => {
    it("should be able to show and hide fields from a nested query", () => {
      cy.createQuestion(tableQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
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

      // cy.log("hide a column");
      // visibleColumns().within(() => hideColumn("Tax"));
      // visibleColumns().findByText("Tax").should("not.exist");
      // disabledColumns().findByText("Tax").should("exist");
      // scrollVisualization();
      // visualization().findByText("Tax").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // visibleColumns().findByText("Tax").should("not.exist");
      // disabledColumns().findByText("Tax").should("not.exist");
      // additionalColumns().findByText("Tax").should("exist");
      // scrollVisualization();
      // visualization().findByText("Tax").should("not.exist");

      // cy.log("show a column");
      // additionalColumns().within(() => showColumn("Tax"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Tax").should("exist");
      // additionalColumns().findByText("Tax").should("not.exist");
      // scrollVisualization();
      // visualization().findByText("Tax").should("exist");
    });

    it("should be able to show and hide fields from a nested query with joins (metabase#32373)", () => {
      cy.createQuestion(tableQuestionWithJoin).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      const testData = {
        column: "Products → Ean",
        columnName: "Products → Ean",
        table: "test question",
      };

      _hideColumn(testData);
      _showColumn(testData);
      _removeColumn(testData);
      _addColumn(testData);

      // cy.log("hide a column");
      // visibleColumns().within(() => hideColumn("Products → Ean"));
      // visibleColumns().findByText("Products → Ean").should("not.exist");
      // disabledColumns().findByText("Products → Ean").should("exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // scrollVisualization("center");
      // visualization().findByText("Products → Ean").should("not.exist");

      // cy.log("show a column");
      // additionalColumns().within(() => showColumn("Products → Ean"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Products → Ean").should("exist");
      // additionalColumns().findByText("Products → Ean").should("not.exist");
      // scrollVisualization("center");
      // visualization().findByText("Products → Ean").should("exist");
    });

    // TODO: This is currently broken by some subtleties of `:lib/source` in MLv2.
    // This is still better than it used to be, so skip this test and fix it later. See #32373.
    it("should be able to show and hide fields from a nested query with joins and fields (metabase#32373)", () => {
      cy.createQuestion(tableQuestionWithJoinAndFields).then(
        ({ body: card }) => {
          cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
        },
      );
      openSettings();

      const testData = {
        column: "Products → Category",
        columnName: "Products → Category",
        table: "test question",
      };

      const testData2 = {
        column: "Ean",
        columnName: "Product → Ean",
        table: "product",
      };

      _hideColumn(testData);
      _removeColumn(testData);

      _addColumn(testData2);

      // // TODO: Once #33972 is fixed in the QP, this test will start failing.
      // // The correct display name is "Products -> Category", but the QP is incorrectly marking this column as coming
      // // from the implicit join (so it's using PRODUCT_ID -> "Product", not the table name "Products").
      _addColumn({
        ...testData,
        column: "Products → Category",
        columnName: "Product → Category",
      });

      // cy.log("hide an existing column");
      // visibleColumns().within(() => hideColumn("Products → Category"));
      // visibleColumns().findByText("Products → Category").should("not.exist");
      // disabledColumns().findByText("Products → Category").should("exist");
      // scrollVisualization();
      // visualization().findByText("Products → Category").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // scrollVisualization();
      // visualization().findByText("Products → Category").should("not.exist");

      // cy.log("show a new column");
      // additionalColumns().within(() => showColumn("Ean"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Product → Ean").should("exist");
      // additionalColumns().findByText("Ean").should("not.exist");
      // scrollVisualization();
      // visualization().findByText("Product → Ean").should("exist");

      // cy.log("show an existing column");
      // additionalColumns().within(() => showColumn("Products → Category"));
      // cy.wait("@dataset");
      // // TODO: Once #33972 is fixed in the QP, this test will start failing.
      // // The correct display name is "Products -> Category", but the QP is incorrectly marking this column as coming
      // // from the implicit join (so it's using PRODUCT_ID -> "Product", not the table name "Products").
      // visibleColumns().findByText("Product → Category").should("exist");
      // visibleColumns().findByText("Product → Ean").should("exist");
      // additionalColumns().findByText("Product → Category").should("not.exist");
      // scrollVisualization();
      // visualization().findByText("Product → Category").should("exist");
      // visualization().findByText("Product → Ean").should("exist");
    });

    it("should be able to show and hide implicitly joinable fields for a nested query with joins and fields", () => {
      cy.createQuestion(tableQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestionWithJoinOnTable(card), {
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

      // cy.log("show a new column");
      // additionalColumns().within(() => showColumn("ID"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("User → ID").should("exist");
      // additionalColumns().findByText("ID").should("not.exist");
      // // Simply scrolling once doesn't bring the column into view reliably.
      // scrollVisualization();
      // cy.wait(200);
      // scrollVisualization();
      // cy.wait(200);
      // scrollVisualization();
      // visualization().findByText("User → ID").should("exist");

      // cy.log("hide the column");
      // visibleColumns().within(() => hideColumn("User → ID"));
      // visibleColumns().findByText("User → ID").should("not.exist");
      // disabledColumns().findByText("User → ID").should("exist");
      // scrollVisualization();
      // visualization().findByText("User → ID").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // visibleColumns().findByText("User → ID").should("not.exist");
      // disabledColumns().findByText("User → ID").should("not.exist");
      // additionalColumns().findByText("ID").should("exist");
      // scrollVisualization();
      // visualization().findByText("User → ID").should("not.exist");
    });

    it("should be able to show and hide implicitly joinable fields for a nested query", () => {
      cy.createQuestion(tableQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
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

      // cy.log("show a column");
      // additionalColumns().within(() => showColumn("Category"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Product → Category").should("exist");
      // additionalColumns().findByText("Category").should("not.exist");
      // scrollVisualization();
      // visualization().findByText("Product → Category").should("exist");

      // cy.log("hide a column");
      // visibleColumns().within(() => hideColumn("Product → Category"));
      // visibleColumns().findByText("Product → Category").should("not.exist");
      // disabledColumns().findByText("Product → Category").should("exist");
      // visualization().findByText("Product → Category").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // visibleColumns().findByText("Product → Category").should("not.exist");
      // additionalColumns().findByText("Category").should("exist");
      // scrollVisualization();
      // visualization().findByText("Product → Category").should("not.exist");
    });

    it("should be able to show and hide custom expressions from a nested query", () => {
      cy.createQuestion(tableQuestionWithExpression).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      const mathColumn = {
        column: "Math",
        columnName: "Math",
        table: "test question",
      };

      _hideColumn(mathColumn);
      _showColumn(mathColumn);
      _removeColumn(mathColumn);
      _addColumn(mathColumn);

      // cy.log("hide a column");
      // visibleColumns().within(() => hideColumn("Math"));
      // visibleColumns().findByText("Math").should("not.exist");
      // disabledColumns().findByText("Math").should("exist");
      // scrollVisualization();
      // visualization().findByText("Math").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // scrollVisualization();
      // visualization().findByText("Math").should("not.exist");

      // cy.log("show a column");
      // additionalColumns().within(() => showColumn("Math"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Math").should("exist");
      // additionalColumns().findByText("Math").should("not.exist");
      // scrollVisualization();
      // visualization().findByText("Math").should("exist");
    });

    it("should be able to show and hide columns from aggregations from a nested query", () => {
      cy.createQuestion(tableWithAggregations).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
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

      //   cy.log("hide a column");
      //   visibleColumns().within(() => hideColumn("Count"));
      //   visibleColumns().findByText("Count").should("not.exist");
      //   visibleColumns().findByText("Sum of Quantity").should("exist");
      //   disabledColumns().findByText("Count").should("exist");
      //   visualization().findByText("Count").should("not.exist");
      //   runQuery();
      //   cy.wait("@dataset");

      //   cy.log("show a column");
      //   additionalColumns().within(() => showColumn("Count"));
      //   cy.wait("@dataset");
      //   visibleColumns().findByText("Count").should("exist");
      //   visibleColumns().findByText("Sum of Quantity").should("exist");
      //   visualization().findByText("Count").should("exist");

      //   cy.log("hide a column with an inner field");
      //   visibleColumns().within(() => hideColumn("Sum of Quantity"));
      //   visibleColumns().findByText("Sum of Quantity").should("not.exist");
      //   visibleColumns().findByText("Count").should("exist");
      //   disabledColumns().findByText("Sum of Quantity").should("exist");
      //   visualization().findByText("Sum of Quantity").should("not.exist");
      //   runQuery();
      //   cy.wait("@dataset");

      //   cy.log("show a column with an inner field");
      //   additionalColumns().within(() => showColumn("Sum of Quantity"));
      //   cy.wait("@dataset");
      //   visibleColumns().findByText("Sum of Quantity").should("exist");
      //   visibleColumns().findByText("Count").should("exist");
      //   visualization().findByText("Sum of Quantity").should("exist");
    });

    it.only("should be able to show and hide columns from a nested query with a self join", () => {
      cy.createQuestion(tableQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestionWithJoinOnQuestion(card), {
          visitQuestion: true,
        });
        openSettings();

        const taxColumn = {
          column: "Tax",
          columnName: `Question ${card.id} → Tax`,
          table: `question ${card.id}`,
          scrollTimes: 3,
        };

        _hideColumn(taxColumn);
        _showColumn(taxColumn);
        _removeColumn(taxColumn);
        _addColumn(taxColumn);

        //   cy.log("hide a column");
        //   visibleColumns().within(() => hideColumn(columnLongName));
        //   visibleColumns().findByText(columnLongName).should("not.exist");
        //   disabledColumns().findByText(columnLongName).should("exist");
        //   scrollVisualization();
        //   visualization().findByText(columnLongName).should("not.exist");

        //   cy.log("re-run the query");
        //   runQuery();
        //   cy.wait("@dataset");
        //   scrollVisualization();
        //   visualization().findByText(columnLongName).should("not.exist");

        //   cy.log("show a column");
        //   additionalColumns().within(() => showColumn(columnName));
        //   cy.wait("@dataset");
        //   visibleColumns().findByText(columnLongName).should("exist");

        //   // Scrolling the table does not work consistently for this query. The columns are wider than it estimates, so
        //   // the first attempt to scroll to the right edge doesn't actually reach it.
        //   // Three attempts with brief pauses seems to work consistently.
        //   scrollVisualization();
        //   cy.wait(60);
        //   scrollVisualization();
        //   cy.wait(60);
        //   scrollVisualization();
        //   visualization().findByText(columnLongName).should("exist");
      });
    });

    it("should be able to show and hide custom expressions from a joined question", () => {
      cy.createQuestion(tableQuestionWithExpression).then(({ body: card }) => {
        cy.createQuestion(tableQuestionWithJoinOnQuestion(card), {
          visitQuestion: true,
        });

        openSettings();

        const mathColumn = {
          column: "Math",
          columnName: `Question ${card.id} → Math`,
          table: `question ${card.id}`,
          scrollTimes: 2,
        };

        _hideColumn(mathColumn);
        _showColumn(mathColumn);
        _removeColumn(mathColumn);
        _addColumn(mathColumn);

        // cy.log("hide a column");
        // visibleColumns().within(() => hideColumn(columnLongName));
        // visibleColumns().findByText(columnLongName).should("not.exist");
        // disabledColumns().findByText(columnLongName).should("exist");
        // scrollVisualization();
        // visualization().findByText(columnLongName).should("not.exist");

        // cy.log("re-run the query");
        // runQuery();
        // cy.wait("@dataset");
        // scrollVisualization();
        // visualization().findByText(columnLongName).should("not.exist");

        // cy.log("show a column");
        // additionalColumns().within(() => showColumn(columnName));
        // cy.wait("@dataset");
        // visibleColumns().findByText(columnLongName).should("exist");
        // additionalColumns().findByText(columnName).should("not.exist");
        // scrollVisualization();
        // visualization().findByText(columnLongName).should("exist");
      });
    });

    it("should be able to show a column from a nested query when it was hidden in the notebook editor", () => {
      cy.createQuestion(tableQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });

      openNotebook();
      cy.findByTestId("fields-picker").click();
      popover().findByText("Tax").click();
      visualize();

      openSettings();

      const taxColumn = {
        column: "Tax",
        columnName: "Tax",
        table: "test question",
      };

      _addColumn(taxColumn);

      // cy.log("show a column");
      // additionalColumns().within(() => showColumn("Tax"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("Tax").should("exist");
      // additionalColumns().findByText("Tax").should("not.exist");
      // scrollVisualization();
      // visualization().findByText("Tax").should("exist");
    });
  });

  describe("nested native questions", () => {
    it("should be able to show and hide fields from a nested native query", () => {
      cy.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
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

      // cy.log("hide a column");
      // visibleColumns().within(() => hideColumn("TAX"));
      // visibleColumns().findByText("TAX").should("not.exist");
      // disabledColumns().findByText("TAX").should("exist");
      // scrollVisualization();
      // visualization().findByText("TAX").should("not.exist");

      // cy.log("re-run the query");
      // runQuery();
      // cy.wait("@dataset");
      // scrollVisualization();
      // visualization().findByText("TAX").should("not.exist");

      // cy.log("show a column");
      // additionalColumns().within(() => showColumn("TAX"));
      // cy.wait("@dataset");
      // visibleColumns().findByText("TAX").should("exist");
      // scrollVisualization();
      // visualization().findByText("TAX").should("exist");
    });
  });
});

const runQuery = () => {
  cy.findByTestId("query-builder-main").icon("play").click();
};

const showColumn = column => {
  cy.findByTestId(`${column}-show-button`).click();
};

const hideColumn = column => {
  cy.findByTestId(`${column}-hide-button`).click();
};

const openSettings = () => {
  cy.findByTestId("viz-settings-button").click();
};

const visualization = () => {
  return cy.findByTestId("TableInteractive-root");
};

const scrollVisualization = (position = "right") => {
  cy.get(".TableInteractive-header.scroll-hide-all").scrollTo(position, {
    force: true,
  });
};

const visibleColumns = () => {
  return cy.findByTestId("visible-columns");
};

const disabledColumns = () => {
  return cy.findByTestId("disabled-columns");
};

const additionalColumns = () => {
  return cy.findByTestId("additional-columns");
};

const getColumn = columnName => {
  return visibleColumns().contains("[role=listitem]", columnName);
};

const assertColumnEnabled = column => {
  column.should("have.attr", "data-enabled", "true");
};

const assertColumnHidden = column => {
  column.should("have.attr", "data-enabled", "false");
};
