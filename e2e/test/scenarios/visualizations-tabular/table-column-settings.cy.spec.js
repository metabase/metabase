import _ from "underscore";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { openNotebook, popover, restore, visualize } from "e2e/support/helpers";

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
    });

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
    });

    it("should be able to show and hide all table fields with a single click", () => {
      cy.createQuestion(tableQuestionWithJoin, { visitQuestion: true });
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
        scrollTimes: 3,
      };

      _hideColumn(firstColumn);
      _removeColumn(firstColumn);

      _addColumn(secondColumn);
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
        needsScroll: false,
      };

      _hideColumn(testData);
      _showColumn(testData);
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
    });

    it("should be able to show and hide fields from a nested query with joins (metabase#32373)", () => {
      cy.createQuestion(tableQuestionWithJoin).then(({ body: card }) => {
        cy.createQuestion(nestedQuestion(card), { visitQuestion: true });
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
        needsScroll: false,
      };

      _hideColumn(mathColumn);
      _showColumn(mathColumn);
      _removeColumn(mathColumn);
      _addColumn(mathColumn);
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
    });

    it("should be able to show and hide columns from a nested query with a self join", () => {
      cy.createQuestion(tableQuestion).then(({ body: card }) => {
        cy.createQuestion(nestedQuestionWithJoinOnQuestion(card), {
          visitQuestion: true,
        });
        openSettings();

        const taxColumn = {
          column: "Tax",
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
      cy.createQuestion(tableQuestionWithExpression).then(({ body: card }) => {
        cy.createQuestion(tableQuestionWithJoinOnQuestion(card), {
          visitQuestion: true,
        });

        openSettings();

        const mathColumn = {
          column: "Math",
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
    });
  });
});

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
  cy.get("#main-data-grid").scrollTo(position, {
    force: true,
  });
};

const visibleColumns = () => {
  return cy.findByTestId("visible-columns");
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
