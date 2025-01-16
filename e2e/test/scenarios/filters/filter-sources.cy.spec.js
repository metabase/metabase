import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS, ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const tableQuestion = {
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: { "source-table": ORDERS_ID },
  },
  visualization_settings: {},
};

const tableQuestionWithExpression = {
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        Total100: ["+", ["field", ORDERS.TOTAL, null], 100],
      },
    },
  },
  visualization_settings: {},
};

const tableQuestionWithJoin = {
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
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
    },
  },
  visualization_settings: {},
};

const tableQuestionWithJoinAndFields = {
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          "source-table": PRODUCTS_ID,
          fields: [["field", PRODUCTS.RATING, { "join-alias": "Products" }]],
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
    },
  },
};

const tableWithAggregations = {
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count"],
        ["sum", ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }]],
      ],
      breakout: [["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }]],
    },
  },
  visualization_settings: {},
};

const structuredQuestion = {
  display: "table",
  database: SAMPLE_DB_ID,
  query: { "source-table": ORDERS_ID },
  visualization_settings: {},
};

const nativeQuestion = {
  display: "table",
  database: SAMPLE_DB_ID,
  native: {
    query: "SELECT * FROM ORDERS",
  },
  visualization_settings: {},
};

const nestedQuestion = card => ({
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": `card__${card.id}`,
    },
  },
  visualization_settings: {},
});

const nestedQuestionWithExpression = card => ({
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": `card__${card.id}`,
      expressions: {
        Total100: ["+", ["field", "TOTAL", { "base-type": "type/Float" }], 100],
      },
    },
  },
  visualization_settings: {},
});

const nestedQuestionWithJoin = card => ({
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": `card__${card.id}`,
      joins: [
        {
          alias: "Products",
          strategy: "left-join",
          fields: "all",
          condition: [
            "=",
            ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
            [
              "field",
              PRODUCTS.ID,
              {
                "base-type": "type/BigInteger",
                "join-alias": "Products",
              },
            ],
          ],
          "source-table": PRODUCTS_ID,
        },
      ],
    },
  },
  visualization_settings: {},
});

const nestedQuestionWithJoinAndFields = card => ({
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": `card__${card.id}`,
      joins: [
        {
          alias: "Products",
          strategy: "left-join",
          fields: [["field", PRODUCTS.RATING, { "join-alias": "Products" }]],
          condition: [
            "=",
            ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
            [
              "field",
              PRODUCTS.ID,
              {
                "base-type": "type/BigInteger",
                "join-alias": "Products",
              },
            ],
          ],
          "source-table": PRODUCTS_ID,
        },
      ],
    },
  },
  visualization_settings: {},
});

const nestedQuestionWithAggregations = card => ({
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": `card__${card.id}`,
      aggregation: [
        ["count"],
        ["sum", ["field", "QUANTITY", { "base-type": "type/Integer" }]],
      ],
      breakout: [["field", "PRODUCT_ID", { "base-type": "type/Integer" }]],
    },
  },
  visualization_settings: {},
});

describe("scenarios > filters > filter sources", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsNormalUser();
  });

  describe("tables", () => {
    it("column from a table", () => {
      cy.visitQuestionAdhoc(tableQuestion, { mode: "notebook" });
      cy.filter({ mode: "notebook" });
      cy.popover().findByText("Tax").click();
      cy.selectFilterOperator("Equal to");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("6.1");
        cy.button("Add filter").click();
      });
      assertFilterName("Tax is equal to 6.1");
      cy.visualize();
      cy.assertQueryBuilderRowCount(10);
    });

    it("column from an expression based on another table column", () => {
      cy.visitQuestionAdhoc(tableQuestionWithExpression, { mode: "notebook" });
      cy.filter({ mode: "notebook" });
      cy.popover().findByText("Total100").click();
      cy.selectFilterOperator("Greater than");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("250.5");
        cy.button("Add filter").click();
      });
      assertFilterName("Total100 is greater than 250.5");
      cy.visualize();
      cy.assertQueryBuilderRowCount(239);
    });

    it("column from an explicit join", () => {
      cy.visitQuestionAdhoc(tableQuestionWithJoin, { mode: "notebook" });
      cy.filter({ mode: "notebook" });
      cy.popover().within(() => {
        cy.findByText("Products").click();
        cy.findByText("Vendor").click();
        cy.findByText("Aufderhar-Boehm").click();
        cy.button("Add filter").click();
      });
      assertFilterName("Products → Vendor is Aufderhar-Boehm");
      cy.visualize();
      cy.assertQueryBuilderRowCount(95);
    });

    it("column from an explicit join with fields", () => {
      cy.visitQuestionAdhoc(tableQuestionWithJoinAndFields, {
        mode: "notebook",
      });
      cy.filter({ mode: "notebook" });
      cy.popover().within(() => {
        cy.findByText("Products").click();
        cy.findByText("Rating").click();
      });
      cy.selectFilterOperator("Equal to");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("3.7");
        cy.button("Add filter").click();
      });
      assertFilterName("Products → Rating is equal to 3.7");
      cy.visualize();
      cy.assertQueryBuilderRowCount(883);
    });

    it("column from an implicit join", () => {
      cy.visitQuestionAdhoc(tableQuestion, { mode: "notebook" });
      cy.filter({ mode: "notebook" });
      cy.popover().within(() => {
        cy.findByText("Product").click();
        cy.findByText("Ean").click();
      });
      cy.selectFilterOperator("Is");
      cy.popover().within(() => {
        cy.findByText("0001664425970").click();
        cy.button("Add filter").click();
      });
      assertFilterName("Product → Ean is 0001664425970");
      cy.visualize();
      cy.assertQueryBuilderRowCount(104);
    });

    it("column from a nested aggregation without column", () => {
      cy.visitQuestionAdhoc(tableWithAggregations, { mode: "notebook" });
      addNewFilter();
      cy.popover().findByText("Count").click();
      cy.selectFilterOperator("Equal to");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("90");
        cy.button("Add filter").click();
      });
      assertFilterName("Count is equal to 90", { stage: 1 });
      cy.visualize();
      cy.assertQueryBuilderRowCount(7);
    });

    it("column from a nested aggregation with column", () => {
      cy.visitQuestionAdhoc(tableWithAggregations, { mode: "notebook" });
      addNewFilter();
      cy.popover().findByText("Sum of Quantity").click();
      cy.selectFilterOperator("Less than");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("350");
        cy.button("Add filter").click();
      });
      assertFilterName("Sum of Quantity is less than 350", { stage: 1 });
      cy.visualize();
      cy.assertQueryBuilderRowCount(115);
    });

    it("column from a nested breakout", () => {
      cy.visitQuestionAdhoc(tableWithAggregations, { mode: "notebook" });
      addNewFilter();
      cy.popover().within(() => {
        cy.findByText("Product ID").click();
        cy.findByPlaceholderText("Enter an ID").type("10");
        cy.button("Add filter").click();
      });
      assertFilterName("Product ID is 10", { stage: 1 });
      cy.visualize();
      cy.assertQueryBuilderRowCount(1);
    });
  });

  describe("nested structured questions", () => {
    it("column from a question", () => {
      cy.createQuestion(structuredQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestion(card), { mode: "notebook" });
      });
      cy.filter({ mode: "notebook" });
      cy.popover().findByText("Tax").click();
      cy.selectFilterOperator("Equal to");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("6.1");
        cy.button("Add filter").click();
      });
      assertFilterName("Tax is equal to 6.1");
      cy.visualize();
      cy.assertQueryBuilderRowCount(10);
    });

    it("column from an expression based on a question column", () => {
      cy.createQuestion(structuredQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithExpression(card), {
          mode: "notebook",
        });
      });
      cy.filter({ mode: "notebook" });
      cy.popover().findByText("Total100").click();
      cy.selectFilterOperator("Greater than");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("250.5");
        cy.button("Add filter").click();
      });
      assertFilterName("Total100 is greater than 250.5");
      cy.visualize();
      cy.assertQueryBuilderRowCount(239);
    });

    it("column from an explicit join", () => {
      cy.createQuestion(structuredQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithJoin(card), {
          mode: "notebook",
        });
      });
      cy.filter({ mode: "notebook" });
      cy.popover().within(() => {
        cy.findByText("Products").click();
        cy.findByText("Vendor").click();
        cy.findByText("Aufderhar-Boehm").click();
        cy.button("Add filter").click();
      });
      assertFilterName("Products → Vendor is Aufderhar-Boehm");
      cy.visualize();
      cy.assertQueryBuilderRowCount(95);
    });

    it("column from an explicit join with fields", () => {
      cy.createQuestion(structuredQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithJoinAndFields(card), {
          mode: "notebook",
        });
      });
      cy.filter({ mode: "notebook" });
      cy.popover().within(() => {
        cy.findByText("Products").click();
        cy.findByText("Rating").click();
      });
      cy.selectFilterOperator("Equal to");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("3.7");
        cy.button("Add filter").click();
      });
      assertFilterName("Products → Rating is equal to 3.7");
      cy.visualize();
      cy.assertQueryBuilderRowCount(883);
    });

    it("column from an implicit join with fields", () => {
      cy.createQuestion(structuredQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithJoinAndFields(card), {
          mode: "notebook",
        });
      });
      cy.filter({ mode: "notebook" });
      cy.popover().within(() => {
        cy.findByText("Products").click();
        cy.findByText("Ean").click();
      });
      cy.selectFilterOperator("Is");
      cy.popover().within(() => {
        cy.findByText("0001664425970").click();
        cy.button("Add filter").click();
      });
      assertFilterName("Products → Ean is 0001664425970");
      cy.visualize();
      cy.assertQueryBuilderRowCount(104);
    });

    it("column from a nested aggregation without column", () => {
      cy.createQuestion(structuredQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithAggregations(card), {
          mode: "notebook",
        });
      });
      addNewFilter();
      cy.popover().findByText("Count").click();
      cy.selectFilterOperator("Equal to");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("90");
        cy.button("Add filter").click();
      });
      assertFilterName("Count is equal to 90", { stage: 1 });
      cy.visualize();
      cy.assertQueryBuilderRowCount(7);
    });

    it("column from a nested aggregation with column", () => {
      cy.createQuestion(structuredQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithAggregations(card), {
          mode: "notebook",
        });
      });
      addNewFilter();
      cy.popover().findByText("Sum of Quantity").click();
      cy.selectFilterOperator("Less than");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("350");
        cy.button("Add filter").click();
      });
      assertFilterName("Sum of Quantity is less than 350", { stage: 1 });
      cy.visualize();
      cy.assertQueryBuilderRowCount(115);
    });

    it("column from a nested breakout", () => {
      cy.createQuestion(structuredQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithAggregations(card), {
          mode: "notebook",
        });
      });
      addNewFilter();
      cy.popover().within(() => {
        cy.findByText("Product ID").click();
        cy.findByPlaceholderText("Enter an ID").type("10");
        cy.button("Add filter").click();
      });
      assertFilterName("Product ID is 10", { stage: 1 });
      cy.visualize();
      cy.assertQueryBuilderRowCount(1);
    });
  });

  describe("nested native questions", () => {
    it("column from a question", () => {
      cy.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestion(card), { mode: "notebook" });
      });
      cy.filter({ mode: "notebook" });
      cy.popover().findByText("TAX").click();
      cy.selectFilterOperator("Equal to");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("6.1");
        cy.button("Add filter").click();
      });
      assertFilterName("TAX is equal to 6.1");
      cy.visualize();
      cy.assertQueryBuilderRowCount(10);
    });

    it("column from an expression based on a question column", () => {
      cy.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithExpression(card), {
          mode: "notebook",
        });
      });
      cy.filter({ mode: "notebook" });
      cy.popover().findByText("Total100").click();
      cy.selectFilterOperator("Greater than");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("250.5");
        cy.button("Add filter").click();
      });
      assertFilterName("Total100 is greater than 250.5");
      cy.visualize();
      cy.assertQueryBuilderRowCount(239);
    });

    it("column from an explicit join", () => {
      cy.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithJoin(card), {
          mode: "notebook",
        });
      });
      cy.filter({ mode: "notebook" });
      cy.popover().within(() => {
        cy.findByText("Products").click();
        cy.findByText("Vendor").click();
        cy.findByText("Aufderhar-Boehm").click();
        cy.button("Add filter").click();
      });
      assertFilterName("Products → Vendor is Aufderhar-Boehm");
      cy.visualize();
      cy.assertQueryBuilderRowCount(95);
    });

    it("column from an explicit join with fields", () => {
      cy.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithJoinAndFields(card), {
          mode: "notebook",
        });
      });
      cy.filter({ mode: "notebook" });
      cy.popover().within(() => {
        cy.findByText("Products").click();
        cy.findByText("Rating").click();
      });
      cy.selectFilterOperator("Equal to");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("3.7");
        cy.button("Add filter").click();
      });
      assertFilterName("Products → Rating is equal to 3.7");
      cy.visualize();
      cy.assertQueryBuilderRowCount(883);
    });

    it("column from an implicit join with fields", () => {
      cy.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithJoinAndFields(card), {
          mode: "notebook",
        });
      });
      cy.filter({ mode: "notebook" });
      cy.popover().within(() => {
        cy.findByText("Products").click();
        cy.findByText("Ean").click();
      });
      cy.selectFilterOperator("Is");
      cy.popover().within(() => {
        cy.findByText("0001664425970").click();
        cy.button("Add filter").click();
      });
      assertFilterName("Products → Ean is 0001664425970");
      cy.visualize();
      cy.assertQueryBuilderRowCount(104);
    });

    it("column from a nested aggregation without column", () => {
      cy.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithAggregations(card), {
          mode: "notebook",
        });
      });
      addNewFilter();
      cy.popover().findByText("Count").click();
      cy.selectFilterOperator("Equal to");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("90");
        cy.button("Add filter").click();
      });
      assertFilterName("Count is equal to 90", { stage: 1 });
      cy.visualize();
      cy.assertQueryBuilderRowCount(7);
    });

    it("column from a nested aggregation with column", () => {
      cy.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithAggregations(card), {
          mode: "notebook",
        });
      });
      addNewFilter();
      cy.popover().findByText("Sum of QUANTITY").click();
      cy.selectFilterOperator("Less than");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("350");
        cy.button("Add filter").click();
      });
      assertFilterName("Sum of QUANTITY is less than 350", { stage: 1 });
      cy.visualize();
      cy.assertQueryBuilderRowCount(115);
    });

    it("column from a nested breakout", () => {
      cy.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        cy.visitQuestionAdhoc(nestedQuestionWithAggregations(card), {
          mode: "notebook",
        });
      });
      addNewFilter();
      cy.popover().findByText("PRODUCT_ID").click();
      cy.selectFilterOperator("Equal to");
      cy.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("10");
        cy.button("Add filter").click();
      });
      assertFilterName("PRODUCT_ID is equal to 10", { stage: 1 });
      cy.visualize();
      cy.assertQueryBuilderRowCount(1);
    });
  });
});

function addNewFilter() {
  cy.findAllByTestId("action-buttons").last().findByText("Filter").click();
}

function assertFilterName(filterName, options) {
  cy.getNotebookStep("filter", options)
    .findByText(filterName)
    .should("be.visible");
}
