import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visualize,
  openTable,
  openOrdersTable,
  popover,
  modal,
  summarize,
  openNativeEditor,
  startNewQuestion,
  entityPickerModal,
  entityPickerModalTab,
  questionInfoButton,
  rightSidebar,
  getNotebookStep,
  visitQuestion,
  openProductsTable,
  visitQuestionAdhoc,
  sidebar,
  openNotebook,
  selectFilterOperator,
  chartPathWithFillColor,
  openQuestionActions,
  queryBuilderHeader,
  describeOSS,
  cartesianChartCircle,
  filter,
  moveColumnDown,
  getDraggableElements,
  resetTestTable,
  getTable,
  resyncDatabase,
  createQuestion,
  saveQuestion,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, SAMPLE_DB_ID, PEOPLE } =
  SAMPLE_DATABASE;

describe("time-series filter widget", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable();
  });

  it("should properly display All time as the initial filtering (metabase#22247)", () => {
    summarize();

    sidebar().contains("Created At").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All time").click();

    popover().within(() => {
      // Implicit assertion: there is only one select button
      cy.findByDisplayValue("All time").should("be.visible");

      cy.button("Apply").should("not.be.disabled");
    });
  });

  it("should allow switching from All time filter", () => {
    cy.findAllByText("Summarize").first().click();
    cy.findAllByText("Created At").last().click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    // switch to previous 30 quarters
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All time").click();
    popover().within(() => {
      cy.findByDisplayValue("All time").click();
    });
    cy.findByTextEnsureVisible("Previous").click();
    cy.findByDisplayValue("days").click();
    cy.findByTextEnsureVisible("quarters").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is in the previous 30 quarters")
      .should("be.visible");
  });

  it("should stay in-sync with the actual filter", () => {
    cy.findAllByText("Filter").first().click();
    cy.findByTestId("filter-column-Created At").within(() => {
      cy.findByLabelText("More options").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Last 3 months").click();
    cy.button("Apply filters").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At is in the previous 3 months").click();
    cy.findByDisplayValue("months").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("years").click();
    cy.button("Update filter").click();
    cy.wait("@dataset");

    cy.findAllByText("Summarize").first().click();
    cy.findAllByText("Created At").last().click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is in the previous 3 years")
      .should("be.visible");

    cy.findByTestId("timeseries-filter-button").click();
    popover().within(() => {
      cy.findByDisplayValue("Previous").should("be.visible");
      cy.findByDisplayValue("All time").should("not.exist");
      cy.findByDisplayValue("Next").should("not.exist");
    });

    // switch to All time filter
    popover().within(() => {
      cy.findByDisplayValue("Previous").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All time").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At is in the previous 3 years").should("not.exist");
    cy.findByTextEnsureVisible("All time");
  });
});

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
    restore();
    cy.signInAsAdmin();
  });

  it("should show only selected columns in a step preview (metabase#23023)", () => {
    visitQuestionAdhoc(questionDetails);

    openNotebook();

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
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      // Start ad-hoc nested question based on the saved one
      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: { "source-table": `card__${id}` },
          type: "query",
        },
      });
    });
  });

  it("from the notebook GUI (metabase#24839-1)", () => {
    cy.icon("notebook").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sum of ...").click();
    popover()
      .should("contain", "Sum of Quantity")
      .and("contain", "Average of Total");
  });

  it("from a table header cell (metabase#24839-2)", () => {
    cy.findAllByTestId("header-cell").contains("Average of Total").click();

    popover().contains("Distinct values").click();

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
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be possible to filter by a column in a multi-stage query (metabase#25016)", () => {
    visitQuestionAdhoc(questionDetails);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").click();

    popover().within(() => {
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
describeOSS("issue 25144", { tags: "@OSS" }, () => {
  beforeEach(() => {
    restore("setup");
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should show Saved Questions section after creating the first question (metabase#25144)", () => {
    cy.visit("/");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Orders").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    modal().findByLabelText("Name").clear().type("Orders question");
    modal().button("Save").click();
    cy.wait("@createCard");
    cy.wait(100);
    modal().button("Not now").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Saved Questions").click();
    popover().findByText("Orders question").should("be.visible");
  });

  it("should show Models section after creation the first model (metabase#24878)", () => {
    cy.visit("/");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Orders").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    modal().findByLabelText("Name").clear().type("Orders model");
    modal().button("Save").click();
    cy.wait("@createCard");
    cy.wait(100);
    modal().button("Not now").click();

    cy.findByLabelText("Move, archive, and more...").click();
    popover().findByText("Turn into a model").click();
    modal().button("Turn this into a model").click();
    cy.wait("@updateCard");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Models").click();
    popover().findByText("Orders model").should("be.visible");
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
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should correctly format the filter operator after the aggregation (metabase#27104)", () => {
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();
    popover().findByText("Count").click();
    // The following line is the main assertion.
    popover().button("Back").should("have.text", "Count");
    // The rest of the test is not really needed for this reproduction.
    selectFilterOperator("Greater than");
    popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("0").blur();
      cy.button("Add filter").click();
    });

    visualize();

    cy.findByTestId("qb-filters-panel").findByText("Count is greater than 0");
    // Check bars count
    chartPathWithFillColor("#509EE3").should("have.length", 5);
  });
});

describe("issue 27462", () => {
  beforeEach(() => {
    restore();
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

    visitQuestionAdhoc(questionDetails, { mode: "notebook" });

    cy.button("Summarize").click();

    cy.findByRole("option", { name: "Sum of ..." }).click();

    popover().within(() => {
      cy.findByRole("option", { name: "Count" }).click();
    });

    cy.button("Visualize").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("200").should("be.visible");
  });
});

describe("issue 28221", () => {
  beforeEach(() => {
    restore();
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
    restore();
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

    openQuestionActions();
    popover().findByText("Turn into a model").click();
    modal().findByText("Turn this into a model").click();

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
    restore();
    cy.signInAsNormalUser();
  });

  it("should allow to modify a pivot question in the notebook (metabase#28874)", () => {
    visitQuestionAdhoc(questionDetails, { mode: "notebook" });

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
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should handle nulls in quick filters (metabase#29082)", () => {
    visitQuestionAdhoc(questionDetails);
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 11 rows").should("exist");

    cy.get(".test-TableInteractive-emptyCell").first().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("=").click());
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
    popover().within(() => cy.findByText("≠").click());
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 3 rows").should("exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Discount is not empty").should("exist");
  });
});

describe("issue 30165", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/card").as("createQuestion");
    cy.intercept("PUT", "/api/card/*").as("updateQuestion");
  });

  it("should not autorun native queries after updating a question (metabase#30165)", () => {
    openNativeEditor();
    cy.findByTestId("native-query-editor").type("SELECT * FROM ORDERS");
    queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").clear().type("Q1");
      cy.findByText("Save").click();
    });
    cy.wait("@createQuestion");
    modal().button("Not now").click();

    cy.findByTestId("native-query-editor").type(" WHERE TOTAL < 20");
    queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@updateQuestion");

    cy.findByTestId("native-query-editor").type(" LIMIT 10");
    queryBuilderHeader().findByText("Save").click();
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
    restore();
    cy.signInAsAdmin();
  });

  it("should remove stale metadata when saving a new question (metabase#30610)", () => {
    openOrdersTable();
    openNotebook();
    removeSourceColumns();
    saveQuestion("New orders");
    createAdHocQuestion("New orders");
    visualizeAndAssertColumns();
  });

  it("should remove stale metadata when updating an existing question (metabase#30610)", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    openNotebook();
    removeSourceColumns();
    updateQuestion();
    createAdHocQuestion("Orders");
    visualizeAndAssertColumns();
  });
});

function updateQuestion() {
  queryBuilderHeader().findByText("Save").click();
  cy.findByTestId("save-question-modal").within(modal => {
    cy.findByText("Save").click();
  });
}

function removeSourceColumns() {
  cy.findByTestId("fields-picker").click();
  popover().findByText("Select none").click();
}

function createAdHocQuestion(questionName) {
  startNewQuestion();
  entityPickerModal().within(() => {
    entityPickerModalTab("Saved questions").click();
    cy.findByText(questionName).click();
  });
  cy.findByTestId("fields-picker").click();
  popover().within(() => {
    cy.findByText("ID").should("be.visible");
    cy.findByText("Total").should("not.exist");
  });
}

function visualizeAndAssertColumns() {
  visualize();
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
    restore();
    cy.signInAsAdmin();
    cy.createQuestion(question).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      visitQuestion(id);
    });
  });

  it("should not show 'Save' after modifying minibar settings for a custom column", () => {
    goToExpressionSidebarVisualizationSettings();
    popover().within(() => {
      const miniBarSwitch = cy.findByLabelText("Show a mini bar chart");
      miniBarSwitch.click();
      miniBarSwitch.should("be.checked");
    });
    saveModifiedQuestion();
  });

  it("should not show 'Save' after text formatting visualization settings", () => {
    goToExpressionSidebarVisualizationSettings();

    popover().within(() => {
      const viewAsDropdown = cy.findByLabelText("Display as");
      viewAsDropdown.click();
    });

    cy.findByLabelText("Email link").click();

    popover().within(() => {
      cy.findByText("Email link").should("exist");
    });

    saveModifiedQuestion();
  });

  it("should not show 'Save' after saving viz settings from the custom column dropdown", () => {
    cy.findAllByTestId("header-cell").contains(EXPRESSION_NAME).click();
    popover().within(() => {
      cy.findByRole("button", { name: /gear icon/i }).click();
    });
    popover().within(() => {
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

describe("issue 32625, issue 31635", () => {
  const CC_NAME = "Is Promotion";

  const QUESTION = {
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          "distinct",
          ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
        ],
        breakout: ["expression", CC_NAME],
        expressions: {
          [CC_NAME]: [
            "case",
            [[[">", ["field", ORDERS.DISCOUNT, null], 0], 1]],
            { default: 0 },
          ],
        },
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should remove dependent clauses when a clause is removed (metabase#32625, metabase#31635)", () => {
    visitQuestionAdhoc(QUESTION, { mode: "notebook" });

    getNotebookStep("expression")
      .findAllByTestId("notebook-cell-item")
      .first()
      .icon("close")
      .click();

    getNotebookStep("expression").should("not.exist");
    getNotebookStep("summarize").findByText(CC_NAME).should("not.exist");

    visualize();

    cy.findByTestId("query-builder-main").within(() => {
      cy.findByTestId("scalar-value").should("have.text", "200");
      cy.findByText("There was a problem with your question").should(
        "not.exist",
      );
    });
  });
});

describe("issue 32964", () => {
  const LONG_NAME = "A very long column name that will cause text overflow";

  const QUESTION = {
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          [LONG_NAME]: [
            "*",
            ["field", SAMPLE_DATABASE.ORDERS.SUBTOTAL, null],
            2,
          ],
        },
        aggregation: [["sum", ["expression", LONG_NAME]]],
        breakout: [
          [
            "field",
            SAMPLE_DATABASE.ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "week",
            },
          ],
        ],
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not overflow chart settings sidebar with long column name (metabase#32964)", () => {
    visitQuestionAdhoc(QUESTION);
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left").within(([sidebar]) => {
      const maxX = sidebar.getBoundingClientRect().right;
      cy.findByText(`Sum of ${LONG_NAME}`).then(([el]) => {
        const x = el.getBoundingClientRect().right;
        expect(x).to.be.lessThan(maxX);
      });
    });
  });
});

describe("issue 33079", () => {
  const questionDetails = {
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.request("GET", "/api/user/current").then(({ body: user }) => {
      cy.request("PUT", `/api/user/${user.id}`, { locale: "de" });
    });
  });

  it("underlying records drill should work in a non-English locale (metabase#33079)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    cartesianChartCircle().eq(1).click({ force: true });
    popover()
      .findByText(/Order/) // See these Orders
      .click();
    cy.wait("@dataset");
    cy.findByTestId("question-row-count").should("contain", "19");
  });
});

describe("issue 34414", () => {
  const { INVOICES_ID } = SAMPLE_DATABASE;

  const INVOICE_MODEL_DETAILS = {
    name: "Invoices Model",
    query: { "source-table": INVOICES_ID },
    type: "model",
  };
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("populate field values after re-adding filter on virtual table field (metabase#34414)", () => {
    cy.createQuestion(INVOICE_MODEL_DETAILS).then(response => {
      const modelId = response.body.id;

      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: { "source-table": `card__${modelId}` },
        },
      });
    });

    openNotebook();
    filter({ mode: "notebook" });

    popover().within(() => {
      cy.findByText("Plan").click();
      assertPlanFieldValues();

      cy.log("Open filter again");
      cy.findByLabelText("Back").click();

      cy.log("Open plan field again");
      cy.findByText("Plan").click();

      assertPlanFieldValues();
    });
  });
});

function assertPlanFieldValues() {
  cy.findByText("Basic").should("be.visible");
  cy.findByText("Business").should("be.visible");
  cy.findByText("Premium").should("be.visible");
}

describe("issue 38176", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/**").as("updateQuestion");
  });

  it("restoring a question to a previous version should preserve the variables (metabase#38176)", () => {
    cy.createNativeQuestion(
      {
        name: "38176",
        native: {
          query:
            'SELECT "COUNTRY" from "ACCOUNTS" WHERE country = {{ country }} LIMIT 5',
          "template-tags": {
            country: {
              type: "text",
              id: "dd06cd10-596b-41d0-9d6e-94e98ceaf989",
              name: "country",
              "display-name": "Country",
            },
          },
        },
      },
      { visitQuestion: true },
    );

    cy.findByPlaceholderText("Country").type("NL");

    cy.findByTestId("query-builder-main").button("Get Answer").click();

    questionInfoButton().click();
    rightSidebar().within(() => {
      cy.findByText("History");

      cy.findByPlaceholderText("Add description")
        .type("This is a question")
        .blur();

      cy.wait("@updateQuestion");
      cy.findByText(/added a description/i);
      cy.findByTestId("question-revert-button").click();

      cy.findByText(/reverted to an earlier version/i).should("be.visible");
    });

    cy.findAllByRole("gridcell").should("contain", "NL");
  });
});

describe("issue 38354", { tags: "@external" }, () => {
  const QUESTION_DETAILS = {
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
    },
  };
  beforeEach(() => {
    restore();
    restore("postgres-12");
    cy.signInAsAdmin();
    cy.createQuestion(QUESTION_DETAILS, { visitQuestion: true });
  });

  it("should be possible to change source database (metabase#38354)", () => {
    openNotebook();
    getNotebookStep("data").findByTestId("data-step-cell").click();
    entityPickerModal().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
    });

    // optimization: add a limit so that query runs faster
    cy.button("Row limit").click();
    getNotebookStep("limit").findByPlaceholderText("Enter a limit").type("5");

    visualize();

    cy.findByTestId("query-builder-main")
      .findByText("There was a problem with your question")
      .should("not.exist");
    cy.get("[data-testid=cell-data]").should("contain", "37.65"); // assert visualization renders the data
  });
});

describe("issue 39102", () => {
  const questionDetails = {
    name: "39102",
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        aggregation: ["count"],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 1000],
      aggregation: ["count"],
    },
    type: "question",
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to preview a multi-stage query (metabase#39102)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    openNotebook();

    getNotebookStep("data", { stage: 0 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Tax").should("be.visible");
      cy.icon("close").click();
    });

    getNotebookStep("summarize", { stage: 0 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("3,610").should("be.visible");
      cy.findByText("744").should("be.visible");
      cy.icon("close").click();
    });

    getNotebookStep("filter", { stage: 1 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("3,610").should("be.visible");
      cy.findByText("744").should("not.exist");
      cy.icon("close").click();
    });

    getNotebookStep("summarize", { stage: 1 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("4").should("be.visible");
    });
  });
});

describe("issue 39795", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    //If you comment out this post, then the test will pass.
    cy.request("post", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      human_readable_field_id: PRODUCTS.TITLE,
      name: "Product ID",
      type: "external",
    });
  });

  it("should allow me to re-order even when a field is set with a different display value (metabase#39795)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
        },
        type: "query",
      },
    });
    cy.findByTestId("viz-settings-button").click();
    moveColumnDown(getDraggableElements().first(), 2);

    // We are not able to re-order because the dataset will also contain values a column for Product ID
    // This causes the isValid() check to fire, and you are always forced into the default value for table.columns
    getDraggableElements().eq(2).should("contain.text", "ID");
  });
});

describe("issue 40176", () => {
  const DIALECT = "postgres";
  const TABLE = "uuid_pk_table";
  beforeEach(() => {
    restore(`${DIALECT}-writable`);
    cy.signInAsAdmin();
    resetTestTable({ type: DIALECT, table: TABLE });
    resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: TABLE,
    });
  });

  it(
    "should allow filtering on UUID PK columns (metabase#40176)",
    { tags: "@external" },
    () => {
      getTable({ name: TABLE }).then(({ id: tableId }) => {
        visitQuestionAdhoc({
          display: "table",
          dataset_query: {
            database: WRITABLE_DB_ID,
            query: {
              "source-table": tableId,
            },
            type: "query",
          },
        });
      });
      openNotebook();
      cy.findByTestId("action-buttons").findByText("Filter").click();
      popover().within(() => {
        cy.findByText("ID").click();
        cy.findByLabelText("Filter value").type(
          "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        );
        cy.button("Add filter").click();
      });
      visualize();
      cy.findByTestId("question-row-count")
        .findByText("Showing 1 row")
        .should("be.visible");
    },
  );
});

describe("issue 40435", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should make new query columns visible by default (metabase#40435)", () => {
    openOrdersTable();
    openNotebook();
    getNotebookStep("data").button("Pick columns").click();
    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByText("User ID").click();
    });
    getNotebookStep("data").button("Pick columns").click();
    visualize();
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByTestId("ID-hide-button").click();
      cy.findByTestId("ID-show-button").click();
    });
    saveQuestion();

    openNotebook();
    getNotebookStep("data").button("Pick columns").click();
    popover().findByText("Product ID").click();
    queryBuilderHeader().findByText("Save").click();
    modal().last().findByText("Save").click();
    cy.wait("@updateCard");
    visualize();

    cy.findByRole("columnheader", { name: "ID" }).should("be.visible");
    cy.findByRole("columnheader", { name: "User ID" }).should("be.visible");
    cy.findByRole("columnheader", { name: "Product ID" }).should("be.visible");
  });
});

describe(
  "issue 42010 -- Unable to filter by mongo id",
  { tags: "@mongo" },
  () => {
    beforeEach(() => {
      restore("mongo-5");
      cy.signInAsAdmin();

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.request(`/api/database/${WRITABLE_DB_ID}/schema/`).then(({ body }) => {
        const tableId = body.find(table => table.name === "orders").id;
        openTable({
          database: WRITABLE_DB_ID,
          table: tableId,
          limit: 2,
        });
      });
      cy.wait("@dataset");
    });

    it("should be possible to filter by Mongo _id column (metabase#40770, metabase#42010)", () => {
      cy.get("#main-data-grid")
        .findAllByRole("gridcell")
        .first()
        .then($cell => {
          // Ids are non-deterministic so we have to obtain the id from the cell, and store its value.
          const id = $cell.text();

          cy.log(
            "Scenario 1 - Make sure the simple mode filter is working correctly (metabase#40770)",
          );
          filter();

          cy.findByRole("dialog").within(() => {
            cy.findByPlaceholderText("Search by ID").type(id);
            cy.button("Apply filters").click();
          });

          cy.findByTestId("question-row-count").should(
            "have.text",
            "Showing 1 row",
          );
          removeFilter();

          cy.log(
            "Scenario 2 - Make sure filter is working in the notebook editor (metabase#42010)",
          );
          openNotebook();
          filter({ mode: "notebook" });

          popover()
            .findAllByRole("option")
            .first()
            .should("have.text", "ID")
            .click();

          cy.findByTestId("string-filter-picker").within(() => {
            cy.findByLabelText("Filter operator").should("have.value", "Is");
            cy.findByPlaceholderText("Search by ID").type(id);
            cy.button("Add filter").click();
          });

          cy.findByTestId("step-filter-0-0").within(() => {
            cy.findByText(`ID is ${id}`);

            cy.log(
              "Scenario 2.1 - Trigger the preview to make sure it reflects the filter correctly",
            );
            cy.icon("play").click();
          });

          // The preview should show only one row
          const ordersColumns = 10;
          cy.findByTestId("preview-root")
            .get("#main-data-grid")
            .findAllByTestId("cell-data")
            .should("have.length.at.most", ordersColumns);

          cy.log("Scenario 2.2 - Make sure we can visualize the data");
          visualize();
          cy.findByTestId("question-row-count").should(
            "have.text",
            "Showing 1 row",
          );
        });
    });
  },
);

function removeFilter() {
  cy.findByTestId("filter-pill").findByLabelText("Remove").click();
  cy.findByTestId("question-row-count").should("have.text", "Showing 2 rows");
}

describe("issue 42244", () => {
  const COLUMN_NAME = "Created At".repeat(5);

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      display_name: COLUMN_NAME,
    });
  });

  it("should allow to change the temporal bucket when the column name is long (metabase#42244)", () => {
    openOrdersTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    popover().within(() => {
      cy.findByText(COLUMN_NAME).realHover();
      cy.findByText("by month").should("be.visible").click();
    });
    popover().last().findByText("Year").click();
    getNotebookStep("summarize")
      .findByText(`${COLUMN_NAME}: Year`)
      .should("be.visible");
  });
});

describe("issue 42957", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("does not show collections that contain models from different tabs (metabase#42957)", () => {
    createQuestion({
      name: "Model",
      type: "model",
      query: {
        "source-table": ORDERS_ID,
      },
    });

    cy.createCollection({ name: "Collection without models" }).then(
      ({ body: collection }) => {
        cy.wrap(collection.id).as("collectionId");
      },
    );

    cy.get("@collectionId").then(collectionId => {
      createQuestion({
        name: "Question",
        type: "question",
        query: {
          "source-table": ORDERS_ID,
        },
        collection_id: collectionId,
      });
    });

    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Models").should(
        "have.attr",
        "aria-selected",
        "true",
      );

      cy.findByText("Collection without models").should("not.exist");
    });
  });
});
