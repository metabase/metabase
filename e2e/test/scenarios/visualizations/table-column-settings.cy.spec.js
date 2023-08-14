import { popover, restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const tableQuestion = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
  },
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
};

const tableQuestionWithExpression = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      Math: ["+", 1, 1],
    },
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
  },
};

const nativeQuestion = {
  display: "table",
  native: {
    query: "SELECT * FROM ORDERS",
  },
};

const nestedQuestion = card => ({
  display: "table",
  query: {
    "source-table": `card__${card.id}`,
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
  },
});

describe("scenarios > visualizations > table column settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("tables", () => {
    it("should be able to show and hide table fields", () => {
      cy.createQuestion(tableQuestion, { visitQuestion: true });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Tax"));
      visibleColumns().findByText("Tax").should("not.exist");
      visibleColumns().findByText("ID").should("exist");
      disabledColumns().findByText("Tax").should("exist");
      additionalColumns().findByText("Tax").should("not.exist");
      visualization().findByText("Tax").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      visualization().findByText("Tax").should("not.exist");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Tax"));
      cy.wait("@dataset");
      visibleColumns().findByText("Tax").should("exist");
      visibleColumns().findByText("ID").should("exist");
      disabledColumns().findByText("Tax").should("not.exist");
      additionalColumns().findByText("Tax").should("not.exist");
      scrollVisualization();
      visualization().findByText("Tax").should("exist");
    });

    it.skip("should be able to rename table columns via popover", () => {
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

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Products → Category"));
      visibleColumns().findByText("Products → Category").should("not.exist");
      visibleColumns().findByText("Products → Ean").should("exist");
      disabledColumns().findByText("Products → Category").should("exist");
      additionalColumns().findByText("Category").should("not.exist");
      visualization().findByText("Products → Category").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      visualization().findByText("Products → Category").should("not.exist");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Category"));
      cy.wait("@dataset");
      visibleColumns().findByText("Products → Category").should("exist");
      visibleColumns().findByText("Products → Ean").should("exist");
      disabledColumns().findByText("Category").should("not.exist");
      additionalColumns().findByText("Category").should("not.exist");
      scrollVisualization();
      visualization().findByText("Products → Category").should("exist");
    });

    it("should be able to show and hide table fields with in a join with fields", () => {
      cy.createQuestion(tableQuestionWithJoinAndFields, {
        visitQuestion: true,
      });
      openSettings();

      cy.log("hide an existing column");
      visibleColumns().within(() => hideColumn("Products → Category"));
      visibleColumns().findByText("Products → Category").should("not.exist");
      visibleColumns().findByText("Products → Ean").should("not.exist");
      disabledColumns().findByText("Products → Category").should("exist");
      additionalColumns().findByText("Category").should("not.exist");
      visualization().findByText("Products → Category").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      visualization().findByText("Products → Category").should("not.exist");

      cy.log("show an existing column");
      additionalColumns().within(() => showColumn("Ean"));
      cy.wait("@dataset");
      visibleColumns().findByText("Products → Ean").should("exist");
      visibleColumns().findByText("Products → Category").should("not.exist");
      disabledColumns().findByText("Products → Ean").should("not.exist");
      additionalColumns().findByText("Ean").should("not.exist");
      additionalColumns().findByText("Category").should("exist");
      scrollVisualization();
      visualization().findByText("Products → Ean").should("exist");

      cy.log("show a new column");
      additionalColumns().within(() => showColumn("Category"));
      cy.wait("@dataset");
      visibleColumns().findByText("Products → Ean").should("exist");
      visibleColumns().findByText("Products → Category").should("exist");
      additionalColumns().findByText("Ean").should("not.exist");
      additionalColumns().findByText("Category").should("not.exist");
      additionalColumns().findByText("Rating").should("exist");
      scrollVisualization();
      visualization().findByText("Products → Category").should("exist");
    });

    it("should be able to show and hide implicitly joinable fields for a table", () => {
      cy.createQuestion(tableQuestion, { visitQuestion: true });
      openSettings();

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Category"));
      cy.wait("@dataset");
      visibleColumns().findByText("Product → Category").should("exist");
      additionalColumns().findByText("Category").should("not.exist");
      scrollVisualization();
      visualization().findByText("Product → Category").should("exist");

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Product → Category"));
      visibleColumns().findByText("Product → Category").should("not.exist");
      disabledColumns().findByText("Product → Category").should("exist");
      additionalColumns().findByText("Category").should("not.exist");
      scrollVisualization();
      visualization().findByText("Product → Category").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      visibleColumns().findByText("Product → Category").should("not.exist");
      disabledColumns().findByText("Product → Category").should("not.exist");
      additionalColumns().findByText("Category").should("exist");
      scrollVisualization();
      visualization().findByText("Product → Category").should("not.exist");
    });

    it("should be able to show and hide custom expressions for a table", () => {
      cy.createQuestion(tableQuestionWithExpression, {
        visitQuestion: true,
      });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Math"));
      visibleColumns().findByText("Math").should("not.exist");
      disabledColumns().findByText("Math").should("exist");
      scrollVisualization();
      visualization().findByText("Math").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      scrollVisualization();
      visualization().findByText("Math").should("not.exist");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Math"));
      cy.wait("@dataset");
      visibleColumns().findByText("Math").should("exist");
      additionalColumns().findByText("Math").should("not.exist");
      scrollVisualization();
      visualization().findByText("Math").should("exist");
    });

    it("should be able to show and hide custom expressions for a table with selected fields", () => {
      cy.createQuestion(tableQuestionWithExpressionAndFields, {
        visitQuestion: true,
      });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Math"));
      visibleColumns().findByText("Math").should("not.exist");
      disabledColumns().findByText("Math").should("exist");
      visualization().findByText("Math").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      visualization().findByText("Math").should("not.exist");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Math"));
      cy.wait("@dataset");
      visibleColumns().findByText("Math").should("exist");
      additionalColumns().findByText("Math").should("not.exist");
      visualization().findByText("Math").should("exist");
    });

    it("should be able to show and hide columns from aggregations", () => {
      cy.createQuestion(tableWithAggregations, { visitQuestion: true });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Count"));
      visibleColumns().findByText("Count").should("not.exist");
      visibleColumns().findByText("Sum of Quantity").should("exist");
      disabledColumns().findByText("Count").should("exist");
      visualization().findByText("Count").should("not.exist");

      cy.log("show a column");
      disabledColumns().within(() => showColumn("Count"));
      visibleColumns().findByText("Count").should("exist");
      visibleColumns().findByText("Sum of Quantity").should("exist");
      visualization().findByText("Count").should("exist");

      cy.log("hide a column with an inner field");
      visibleColumns().within(() => hideColumn("Sum of Quantity"));
      visibleColumns().findByText("Sum of Quantity").should("not.exist");
      visibleColumns().findByText("Count").should("exist");
      disabledColumns().findByText("Sum of Quantity").should("exist");
      visualization().findByText("Sum of Quantity").should("not.exist");

      cy.log("show a column with an inner field");
      disabledColumns().within(() => showColumn("Sum of Quantity"));
      visibleColumns().findByText("Sum of Quantity").should("exist");
      visibleColumns().findByText("Count").should("exist");
      visualization().findByText("Sum of Quantity").should("exist");
    });
  });

  describe("nested structured questions", () => {
    it("should be able to show and hide fields from a nested query", () => {
      cy.createQuestion(tableQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Tax"));
      visibleColumns().findByText("Tax").should("not.exist");
      disabledColumns().findByText("Tax").should("exist");
      scrollVisualization();
      visualization().findByText("Tax").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      scrollVisualization();
      visualization().findByText("Tax").should("not.exist");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Tax"));
      cy.wait("@dataset");
      visibleColumns().findByText("Tax").should("exist");
      additionalColumns().findByText("Tax").should("not.exist");
      scrollVisualization();
      visualization().findByText("Tax").should("exist");
    });

    it.skip("should be able to show and hide fields from a nested query with joins (metabase#32373)", () => {
      cy.createQuestion(tableQuestionWithJoin).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Products → Ean"));
      visibleColumns().findByText("Products → Ean").should("not.exist");
      disabledColumns().findByText("Products → Ean").should("exist");
      scrollVisualization();
      visualization().findByText("Products → Ean").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      scrollVisualization();
      visualization().findByText("Products → Ean").should("not.exist");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Products → Ean"));
      cy.wait("@dataset");
      visibleColumns().findByText("Products → Ean").should("exist");
      additionalColumns().findByText("Products → Ean").should("not.exist");
      scrollVisualization();
      visualization().findByText("Products → Ean").should("exist");
    });

    it.skip("should be able to show and hide fields from a nested query with joins and fields (metabase#32373)", () => {
      cy.createQuestion(tableQuestionWithJoinAndFields).then(
        ({ body: card }) => {
          cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
        },
      );
      openSettings();

      cy.log("hide an existing column");
      visibleColumns().within(() => hideColumn("Products → Category"));
      visibleColumns().findByText("Products → Category").should("not.exist");
      disabledColumns().findByText("Products → Category").should("exist");
      scrollVisualization();
      visualization().findByText("Products → Category").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      scrollVisualization();
      visualization().findByText("Products → Category").should("not.exist");

      cy.log("show a new column");
      additionalColumns().within(() => showColumn("Ean"));
      cy.wait("@dataset");
      visibleColumns().findByText("Product → Ean").should("exist");
      additionalColumns().findByText("Ean").should("not.exist");
      scrollVisualization();
      visualization().findByText("Products → Ean").should("exist");

      cy.log("show an existing column");
      additionalColumns().within(() => showColumn("Products → Category"));
      cy.wait("@dataset");
      visibleColumns().findByText("Products → Category").should("exist");
      visibleColumns().findByText("Products → Ean").should("exist");
      additionalColumns().findByText("Products → Category").should("not.exist");
      scrollVisualization();
      visualization().findByText("Products → Category").should("exist");
      visualization().findByText("Products → Ean").should("exist");
    });

    it("should be able to show and hide implicitly joinable fields for a nested query", () => {
      cy.createQuestion(tableQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Category"));
      cy.wait("@dataset");
      visibleColumns().findByText("Product → Category").should("exist");
      additionalColumns().findByText("Category").should("not.exist");
      scrollVisualization();
      visualization().findByText("Product → Category").should("exist");

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Product → Category"));
      visibleColumns().findByText("Product → Category").should("not.exist");
      disabledColumns().findByText("Product → Category").should("exist");
      visualization().findByText("Product → Category").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      visibleColumns().findByText("Product → Category").should("not.exist");
      additionalColumns().findByText("Category").should("exist");
      scrollVisualization();
      visualization().findByText("Product → Category").should("not.exist");
    });

    it("should be able to show and hide custom expressions from a nested query", () => {
      cy.createQuestion(tableQuestionWithExpression).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Math"));
      visibleColumns().findByText("Math").should("not.exist");
      disabledColumns().findByText("Math").should("exist");
      scrollVisualization();
      visualization().findByText("Math").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      scrollVisualization();
      visualization().findByText("Math").should("not.exist");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Math"));
      cy.wait("@dataset");
      visibleColumns().findByText("Math").should("exist");
      additionalColumns().findByText("Math").should("not.exist");
      scrollVisualization();
      visualization().findByText("Math").should("exist");
    });

    it("should be able to show and hide columns from aggregations from a nested query", () => {
      cy.createQuestion(tableWithAggregations).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Count"));
      visibleColumns().findByText("Count").should("not.exist");
      visibleColumns().findByText("Sum of Quantity").should("exist");
      disabledColumns().findByText("Count").should("exist");
      visualization().findByText("Count").should("not.exist");
      runQuery();
      cy.wait("@dataset");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Count"));
      cy.wait("@dataset");
      visibleColumns().findByText("Count").should("exist");
      visibleColumns().findByText("Sum of Quantity").should("exist");
      visualization().findByText("Count").should("exist");

      cy.log("hide a column with an inner field");
      visibleColumns().within(() => hideColumn("Sum of Quantity"));
      visibleColumns().findByText("Sum of Quantity").should("not.exist");
      visibleColumns().findByText("Count").should("exist");
      disabledColumns().findByText("Sum of Quantity").should("exist");
      visualization().findByText("Sum of Quantity").should("not.exist");
      runQuery();
      cy.wait("@dataset");

      cy.log("show a column with an inner field");
      additionalColumns().within(() => showColumn("Sum of Quantity"));
      cy.wait("@dataset");
      visibleColumns().findByText("Sum of Quantity").should("exist");
      visibleColumns().findByText("Count").should("exist");
      visualization().findByText("Sum of Quantity").should("exist");
    });

    it("should be able to show and hide questions from a nested query with a self join", () => {
      cy.createQuestion(tableQuestion).then(({ body: card }) => {
        const columnName = "Tax";
        const columnLongName = `Question ${card.id} → ${columnName}`;

        cy.createQuestion(nestedQuestionWithJoinOnQuestion(card), {
          visitQuestion: true,
        });
        openSettings();

        cy.log("hide a column");
        visibleColumns().within(() => hideColumn(columnLongName));
        visibleColumns().findByText(columnLongName).should("not.exist");
        disabledColumns().findByText(columnLongName).should("exist");
        scrollVisualization();
        visualization().findByText(columnLongName).should("not.exist");

        cy.log("re-run the query");
        runQuery();
        cy.wait("@dataset");
        scrollVisualization();
        visualization().findByText(columnLongName).should("not.exist");

        cy.log("show a column");
        additionalColumns().within(() => showColumn(columnName));
        cy.wait("@dataset");
        visibleColumns().findByText(columnLongName).should("exist");
        scrollVisualization();
        visualization().findByText(columnLongName).should("exist");
      });
    });

    it("should be able to show and hide custom expressions from a joined question", () => {
      cy.createQuestion(tableQuestionWithExpression).then(({ body: card }) => {
        cy.createQuestion(tableQuestionWithJoinOnQuestion(card), {
          visitQuestion: true,
        });
        const columnName = "Math";
        const columnLongName = `Question ${card.id} → ${columnName}`;

        openSettings();

        cy.log("hide a column");
        visibleColumns().within(() => hideColumn(columnLongName));
        visibleColumns().findByText(columnLongName).should("not.exist");
        disabledColumns().findByText(columnLongName).should("exist");
        scrollVisualization();
        visualization().findByText(columnLongName).should("not.exist");

        cy.log("re-run the query");
        runQuery();
        cy.wait("@dataset");
        scrollVisualization();
        visualization().findByText(columnLongName).should("not.exist");

        cy.log("show a column");
        additionalColumns().within(() => showColumn(columnName));
        cy.wait("@dataset");
        visibleColumns().findByText(columnLongName).should("exist");
        additionalColumns().findByText(columnName).should("not.exist");
        scrollVisualization();
        visualization().findByText(columnLongName).should("exist");
      });
    });
  });

  describe("nested native questions", () => {
    it("should be able to show and hide fields from a nested native query", () => {
      cy.createNativeQuestion(nativeQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("TAX"));
      visibleColumns().findByText("TAX").should("not.exist");
      disabledColumns().findByText("TAX").should("exist");
      scrollVisualization();
      visualization().findByText("TAX").should("not.exist");

      cy.log("re-run the query");
      runQuery();
      cy.wait("@dataset");
      scrollVisualization();
      visualization().findByText("TAX").should("not.exist");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("TAX"));
      cy.wait("@dataset");
      visibleColumns().findByText("TAX").should("exist");
      scrollVisualization();
      visualization().findByText("TAX").should("exist");
    });
  });
});

const runQuery = () => {
  cy.findByTestId("query-builder-main").icon("play").click();
};

const showColumn = column => {
  cy.findByTestId(`${column}-add-button`).click();
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
  cy.get("#main-data-grid").scrollTo(position);
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
