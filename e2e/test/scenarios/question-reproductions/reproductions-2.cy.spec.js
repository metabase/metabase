import { H } from "e2e/support";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE } = SAMPLE_DATABASE;

describe("issue 23023", () => {
  const questionDetails = {
    display: "table",
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: [
              ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
            ],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        fields: [
          ["field", ORDERS.ID, null],
          ["field", ORDERS.PRODUCT_ID, null],
        ],
      },
      type: "query",
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show only selected columns in a step preview (metabase#23023)", () => {
    H.visitQuestionAdhoc(questionDetails);

    H.openNotebook();

    cy.icon("play").eq(1).click();

    cy.findAllByTestId("header-cell").contains("Products → Category");
    cy.findAllByTestId("header-cell").contains("Tax").should("not.exist");
  });
});

describe("issue 24839: should be able to summarize a nested question based on the source question with aggregations (metabase#24839)", () => {
  const questionDetails = {
    name: "24839",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["sum", ["field", ORDERS.QUANTITY, null]],
        ["avg", ["field", ORDERS.TOTAL, null]],
      ],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    display: "line",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      // Start ad-hoc nested question based on the saved one
      H.visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: { "source-table": `card__${id}` },
          type: "query",
        },
      });
    });
  });

  it("from the notebook GUI (metabase#24839-1)", () => {
    H.openNotebook();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sum of ...").click();
    H.popover()
      .should("contain", "Sum of Quantity")
      .and("contain", "Average of Total");
  });

  it("from a table header cell (metabase#24839-2)", () => {
    H.tableHeaderClick("Average of Total");

    H.popover().contains("Distinct values").click();

    cy.findByTestId("scalar-value").invoke("text").should("eq", "49");

    cy.findByTestId("aggregation-item")
      .invoke("text")
      .should("eq", "Distinct values of Average of Total");
  });
});

describe("issue 25016", () => {
  const questionDetails = {
    display: "table",
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-query": {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
            ["field", PRODUCTS.CATEGORY, null],
          ],
        },
        aggregation: [["count"]],
        breakout: [["field", "CATEGORY", { "base-type": "type/Text" }]],
      },
    },
    visualization_settings: {
      "table.pivot_column": "CATEGORY",
      "table.cell_column": "count",
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be possible to filter by a column in a multi-stage query (metabase#25016)", () => {
    H.visitQuestionAdhoc(questionDetails);
    H.tableHeaderClick("Category");

    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 1 row").should("be.visible");
  });
});

// this is only testable in OSS because EE always has models from auditv2
describe("issue 25144", { tags: "@OSS" }, () => {
  beforeEach(() => {
    H.onlyOnOSS();
    H.restore("setup");
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should show Saved Questions tab after creating the first question (metabase#25144)", () => {
    cy.visit("/");

    H.newButton("Question").click();

    H.entityPickerModal().within(() => {
      cy.findByText("Saved questions").should("not.exist");
      H.entityPickerModalItem(2, "Orders").click();
    });

    H.saveQuestion("Orders question");

    H.newButton("Question").click();

    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Saved questions").should("be.visible").click();
      H.entityPickerModalItem(1, "Orders question").should("be.visible");
    });
  });

  it("should show Models tab after creation the first model (metabase#24878)", () => {
    cy.visit("/");

    H.newButton("Model").click();
    cy.findByTestId("new-model-options")
      .findByText(/use the notebook/i)
      .click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalItem(2, "Orders").click();
    });

    cy.findByTestId("dataset-edit-bar").button("Save").click();

    H.modal().within(() => {
      cy.findByLabelText("Name").clear().type("Orders model");
      cy.button("Save").click();
    });
    cy.wait("@createCard");

    H.newButton("Question").click();

    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Models").should("be.visible").click();
      H.entityPickerModalItem(1, "Orders model").should("be.visible");
    });
  });
});

describe("issue 27104", () => {
  const questionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
        ],
      },
      type: "query",
    },
    display: "bar",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should correctly format the filter operator after the aggregation (metabase#27104)", () => {
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();
    H.popover().findByText("Count").click();
    // The following line is the main assertion.
    H.popover().button("Back").should("have.text", "Count");
    // The rest of the test is not really needed for this reproduction.
    H.selectFilterOperator("Greater than");
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("0").blur();
      cy.button("Add filter").click();
    });

    H.visualize();

    cy.findByTestId("qb-filters-panel").findByText("Count is greater than 0");
    // Check bars count
    H.chartPathWithFillColor("#509EE3").should("have.length", 5);
  });
});

describe("issue 27462", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be able to select field when double aggregating metabase#27462", () => {
    const questionDetails = {
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
      },
      display: "table",
      visualization_settings: {},
    };

    H.visitQuestionAdhoc(questionDetails, { mode: "notebook" });

    cy.button("Summarize").click();

    cy.findByRole("option", { name: "Sum of ..." }).click();

    H.popover().within(() => {
      cy.findByRole("option", { name: "Count" }).click();
    });

    cy.button("Visualize").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("200").should("be.visible");
  });
});

describe("issue 28221", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be able to select see notebook view even if a question custom field metadata is missing#27462", () => {
    const questionName = "Reproduce 28221";
    const customFieldName = "Non-existing field";
    const questionDetails = {
      name: questionName,
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
        expressions: {
          [customFieldName]: ["field", 9999, null],
        },
      },
    };

    cy.createQuestion(questionDetails).then(({ body }) => {
      const questionId = body.id;

      cy.visit(`/question/${questionId}/notebook`);
    });

    cy.findByDisplayValue(questionName).should("be.visible");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(customFieldName).should("be.visible");
  });
});

describe("issue 28599", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    cy.createQuestion(
      {
        name: "28599",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "year",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );

    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should not show time granularity footer after question conversion to a model (metabase#28599)", () => {
    cy.findByTestId("timeseries-chrome").within(() => {
      cy.findByText("View").should("be.visible");
      cy.findByText("All time").should("be.visible");
      cy.findByText("by").should("be.visible");
      cy.findByText("Year").should("be.visible");
    });

    H.openQuestionActions();
    H.popover().findByText("Turn into a model").click();
    H.modal().findByText("Turn this into a model").click();

    cy.wait("@updateCard");

    cy.findByTestId("time-series-mode-bar").should("not.exist");
  });
});

describe("issue 28874", () => {
  const questionDetails = {
    name: "28874",
    display: "pivot",
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          ["field", ORDERS.PRODUCT_ID, null],
        ],
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to modify a pivot question in the notebook (metabase#28874)", () => {
    H.visitQuestionAdhoc(questionDetails, { mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID").parent().icon("close").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID").should("not.exist");
  });
});

describe("issue 29082", () => {
  const questionDetails = {
    name: "22788",
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        filter: ["=", ["field", ORDERS.USER_ID, null], 1],
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should handle nulls in quick filters (metabase#29082)", () => {
    H.visitQuestionAdhoc(questionDetails);
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 11 rows").should("exist");

    cy.get(".test-TableInteractive-emptyCell").first().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    H.popover().within(() => cy.findByText("=").click());
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 8 rows").should("exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Discount is empty").should("exist");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Discount is empty").icon("close").click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 11 rows").should("exist");

    cy.get(".test-TableInteractive-emptyCell").first().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    H.popover().within(() => cy.findByText("≠").click());
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 3 rows").should("exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Discount is not empty").should("exist");
  });
});

describe("issue 30165", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/card").as("createQuestion");
    cy.intercept("PUT", "/api/card/*").as("updateQuestion");
  });

  it("should not autorun native queries after updating a question (metabase#30165)", () => {
    H.openNativeEditor();
    H.focusNativeEditor().type("SELECT * FROM ORDERS");
    H.queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").clear().type("Q1");
      cy.findByText("Save").click();
    });
    cy.wait("@createQuestion");
    cy.button("Not now").click();

    H.focusNativeEditor().type(" WHERE TOTAL < 20");
    H.queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@updateQuestion");

    H.focusNativeEditor().type(" LIMIT 10");
    H.queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@updateQuestion");

    cy.get("@dataset.all").should("have.length", 0);
    cy.get("@cardQuery.all").should("have.length", 0);
    cy.findByTestId("query-builder-main")
      .findByText("Here's where your results will appear")
      .should("be.visible");
  });
});

describe("issue 30610", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should remove stale metadata when saving a new question (metabase#30610)", () => {
    H.openOrdersTable();
    H.openNotebook();
    removeSourceColumns();
    H.saveQuestion("New orders");
    createAdHocQuestion("New orders");
    visualizeAndAssertColumns();
  });

  it("should remove stale metadata when updating an existing question (metabase#30610)", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    H.openNotebook();
    removeSourceColumns();
    updateQuestion();
    createAdHocQuestion("Orders");
    visualizeAndAssertColumns();
  });
});

describe("issue 36669", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/search*").as("search");
  });

  it("should be able to change question data source to raw data after selecting saved question (metabase#36669)", () => {
    const questionDetails = {
      name: "Orders 36669",
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    H.createQuestion(questionDetails).then(() => {
      H.startNewQuestion();
    });

    H.entityPickerModal().within(() => {
      cy.findByPlaceholderText("Search this collection or everywhere…").type(
        "Orders 36669",
      );
      cy.wait("@search");

      cy.findByText("Everywhere").click();
      cy.findByRole("tabpanel").findByText("Orders 36669").click();
    });

    H.getNotebookStep("data").findByText("Orders 36669").click();

    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();

      cy.log("verify Tables are listed");
      cy.findByRole("tabpanel").should("contain", "Orders");
    });
  });
});

describe("issue 35290", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should render column settings when source query is a table joined on itself (metabase#35290)", () => {
    const questionDetails = {
      name: "Orders + Orders",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            "source-table": ORDERS_ID,
            condition: [
              "=",
              ["field", ORDERS.ID, null],
              ["field", ORDERS.ID, null],
            ],
            alias: "Orders",
          },
        ],
        limit: 5,
      },
    };

    H.createQuestion(questionDetails).then(({ body: { id: questionId } }) => {
      const questionDetails = {
        name: "35290",
        query: {
          "source-table": `card__${questionId}`,
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });
    });

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar")
      // verify panel is shown
      .should("contain", "Add or remove columns")
      // verify column name is shown
      .should("contain", "Created At");

    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.icon("warning").should("not.exist");
    });
  });
});

describe("issue 43216", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createNativeQuestion({
      name: "Source question",
      native: { query: "select 1 as A, 2 as B, 3 as C" },
    });
  });

  it("should update source question metadata when it changes (metabase#43216)", () => {
    cy.visit("/");

    cy.log("Create target question");
    H.newButton("Question").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Saved questions").click();
      cy.findByText("Source question").click();
    });
    H.saveQuestion("Target question");

    cy.log("Update source question");
    H.commandPaletteButton().click();
    H.commandPalette().findByText("Source question").click();
    cy.findByTestId("native-query-editor-container")
      .findByText("Open Editor")
      .click();
    H.focusNativeEditor().should("be.visible").type(" , 4 as D");
    H.saveSavedQuestion();

    cy.log("Assert updated metadata in target question");
    H.commandPaletteButton().click();
    H.commandPalette().findByText("Target question").click();
    cy.findAllByTestId("header-cell").eq(3).should("have.text", "D");
    H.openNotebook();
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("D").should("be.visible");
  });
});

function updateQuestion() {
  H.queryBuilderHeader().findByText("Save").click();
  cy.findByTestId("save-question-modal").within(modal => {
    cy.findByText("Save").click();
  });
}

function removeSourceColumns() {
  cy.findByTestId("fields-picker").click();
  H.popover().findByText("Select none").click();
}

function createAdHocQuestion(questionName) {
  H.startNewQuestion();
  H.entityPickerModal().within(() => {
    H.entityPickerModalTab("Saved questions").click();
    cy.findByText(questionName).click();
  });
  cy.findByTestId("fields-picker").click();
  H.popover().within(() => {
    cy.findByText("ID").should("be.visible");
    cy.findByText("Total").should("not.exist");
  });
}

function visualizeAndAssertColumns() {
  H.visualize();
  cy.findByTestId("TableInteractive-root").within(() => {
    cy.findByText("ID").should("exist");
    cy.findByText("Total").should("not.exist");
  });
}

const EXPRESSION_NAME = "TEST_EXPRESSION";

describe("Custom columns visualization settings", () => {
  const question = {
    name: "30905",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        [EXPRESSION_NAME]: ["+", 1, 1],
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.createQuestion(question).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      H.visitQuestion(id);
    });
  });

  it("should not show 'Save' after modifying minibar settings for a custom column", () => {
    goToExpressionSidebarVisualizationSettings();
    H.popover().within(() => {
      const miniBarSwitch = cy.findByLabelText("Show a mini bar chart");
      miniBarSwitch.click();
      miniBarSwitch.should("be.checked");
    });
    saveModifiedQuestion();
  });

  it("should not show 'Save' after text formatting visualization settings", () => {
    goToExpressionSidebarVisualizationSettings();

    H.popover().within(() => {
      const viewAsDropdown = cy.findByLabelText("Display as");
      viewAsDropdown.click();
    });

    cy.findByLabelText("Email link").click();

    H.popover().within(() => {
      cy.findByText("Email link").should("exist");
    });

    saveModifiedQuestion();
  });

  it("should not show 'Save' after saving viz settings from the custom column dropdown", () => {
    H.tableHeaderClick(EXPRESSION_NAME);
    H.popover().within(() => {
      cy.findByRole("button", { name: /gear icon/i }).click();
    });
    H.popover().within(() => {
      const miniBarSwitch = cy.findByLabelText("Show a mini bar chart");
      miniBarSwitch.click();
      miniBarSwitch.should("be.checked");
    });

    saveModifiedQuestion();
  });
});

function saveModifiedQuestion() {
  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.findByText("Save").click();
  });
  cy.findByTestId("save-question-modal").within(() => {
    cy.findByText(/Replace original question/i).should("exist");
    cy.findByText("Save").click();
  });

  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.findByText("Save").should("not.exist");
  });
}

function goToExpressionSidebarVisualizationSettings() {
  cy.findByTestId("viz-settings-button").click();
  cy.findByTestId(`${EXPRESSION_NAME}-settings-button`).click();
}
