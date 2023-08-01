import { restore } from "e2e/support/helpers";
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

const tableWithAggregation = {
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["count"],
      ["sum", ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }]],
    ],
  },
};

const nestedQuestion = ({ id }) => ({
  display: "table",
  query: {
    "source-table": `card__${id}`,
  },
});

describe("scenarios > visualizations > table column settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("table data source", () => {
    it("should be able to show and hide table fields", () => {
      cy.createQuestion(tableQuestion, { visitQuestion: true });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Tax"));
      visibleColumns().findByText("Tax").should("not.exist");
      visibleColumns().findByText("ID").should("exist");
      disabledColumns().findByText("Tax").should("exist");
      additionalColumns().findByText("Tax").should("not.exist");
      runQuery();
      cy.wait("@dataset");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Tax"));
      cy.wait("@dataset");
      visibleColumns().findByText("Tax").should("exist");
      visibleColumns().findByText("ID").should("exist");
      disabledColumns().findByText("Tax").should("not.exist");
      additionalColumns().findByText("Tax").should("not.exist");
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
      runQuery();
      cy.wait("@dataset");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Category"));
      cy.wait("@dataset");
      visibleColumns().findByText("Products → Category").should("exist");
      visibleColumns().findByText("Products → Ean").should("exist");
      disabledColumns().findByText("Category").should("not.exist");
      additionalColumns().findByText("Category").should("not.exist");
    });

    it("should be able to show and hide table fields with in a join with fields", () => {
      cy.createQuestion(tableQuestionWithJoinAndFields, {
        visitQuestion: true,
      });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Products → Category"));
      visibleColumns().findByText("Products → Category").should("not.exist");
      visibleColumns().findByText("Products → Ean").should("not.exist");
      disabledColumns().findByText("Products → Category").should("exist");
      additionalColumns().findByText("Category").should("not.exist");
      runQuery();
      cy.wait("@dataset");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Ean"));
      cy.wait("@dataset");
      visibleColumns().findByText("Products → Ean").should("exist");
      visibleColumns().findByText("Products → Category").should("not.exist");
      disabledColumns().findByText("Products → Ean").should("not.exist");
      additionalColumns().findByText("Ean").should("not.exist");
      additionalColumns().findByText("Category").should("exist");

      cy.log("show another column");
      additionalColumns().within(() => showColumn("Category"));
      cy.wait("@dataset");
      visibleColumns().findByText("Products → Ean").should("exist");
      visibleColumns().findByText("Products → Category").should("exist");
      additionalColumns().findByText("Ean").should("not.exist");
      additionalColumns().findByText("Category").should("not.exist");
      additionalColumns().findByText("Rating").should("exist");
    });

    it("should be able to show and hide implicitly joinable fields for a table", () => {
      cy.createQuestion(tableQuestion, { visitQuestion: true });
      openSettings();

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Category"));
      cy.wait("@dataset");
      visibleColumns().findByText("Product → Category").should("exist");
      additionalColumns().findByText("Category").should("not.exist");

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Product → Category"));
      visibleColumns().findByText("Product → Category").should("not.exist");
      disabledColumns().findByText("Product → Category").should("exist");
      additionalColumns().findByText("Category").should("not.exist");
      runQuery();
      cy.wait("@dataset");

      visibleColumns().findByText("Product → Category").should("not.exist");
      disabledColumns().findByText("Product → Category").should("not.exist");
      additionalColumns().findByText("Category").should("exist");
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
      runQuery();
      cy.wait("@dataset");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Math"));
      cy.wait("@dataset");
      visibleColumns().findByText("Math").should("exist");
      additionalColumns().findByText("Math").should("not.exist");
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
      runQuery();
      cy.wait("@dataset");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Math"));
      cy.wait("@dataset");
      visibleColumns().findByText("Math").should("exist");
      additionalColumns().findByText("Math").should("not.exist");
    });

    it("should be able to show and hide columns from aggregations", () => {
      cy.createQuestion(tableWithAggregation, { visitQuestion: true });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Count"));
      visibleColumns().findByText("Count").should("not.exist");
      visibleColumns().findByText("Sum of Quantity").should("exist");
      disabledColumns().findByText("Count").should("exist");

      cy.log("show a column");
      disabledColumns().within(() => showColumn("Count"));
      visibleColumns().findByText("Count").should("exist");
      visibleColumns().findByText("Sum of Quantity").should("exist");

      cy.log("hide a column with an inner field");
      visibleColumns().within(() => hideColumn("Sum of Quantity"));
      visibleColumns().findByText("Sum of Quantity").should("not.exist");
      visibleColumns().findByText("Count").should("exist");
      disabledColumns().findByText("Sum of Quantity").should("exist");

      cy.log("show a column with an inner field");
      disabledColumns().within(() => showColumn("Sum of Quantity"));
      visibleColumns().findByText("Sum of Quantity").should("exist");
      visibleColumns().findByText("Count").should("exist");
    });
  });

  describe("structured question data source", () => {
    it("should be able to show and hide nested query fields", () => {
      cy.createQuestion(tableQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Tax"));
      visibleColumns().findByText("Tax").should("not.exist");
      disabledColumns().findByText("Tax").should("exist");
      runQuery();
      cy.wait("@dataset");

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Tax"));
      cy.wait("@dataset");
      visibleColumns().findByText("Tax").should("exist");
      additionalColumns().findByText("Tax").should("not.exist");
    });

    it("should be able to show and hide implicitly joinable fields for the nested query table", () => {
      cy.createQuestion(tableQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
      });
      openSettings();

      cy.log("show a column");
      additionalColumns().within(() => showColumn("Category"));
      cy.wait("@dataset");
      visibleColumns().findByText("Product → Category").should("exist");
      additionalColumns().findByText("Category").should("not.exist");

      cy.log("hide a column");
      visibleColumns().within(() => hideColumn("Product → Category"));
      visibleColumns().findByText("Product → Category").should("not.exist");
      disabledColumns().findByText("Product → Category").should("exist");
      runQuery();
      cy.wait("@dataset");

      visibleColumns().findByText("Product → Category").should("not.exist");
      additionalColumns().findByText("Category").should("exist");
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

const visibleColumns = () => {
  return cy.findByTestId("visible-columns");
};

const disabledColumns = () => {
  return cy.findByTestId("disabled-columns");
};

const additionalColumns = () => {
  return cy.findByTestId("additional-columns");
};
