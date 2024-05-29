import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visualize,
  openOrdersTable,
  popover,
  modal,
  summarize,
  openNativeEditor,
  startNewQuestion,
  entityPickerModal,
  entityPickerModalTab,
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
  saveQuestion,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE } = SAMPLE_DATABASE;

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
