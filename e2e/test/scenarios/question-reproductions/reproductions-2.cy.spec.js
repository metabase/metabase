const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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

    H.createQuestion(questionDetails).then(({ body }) => {
      const questionId = body.id;

      cy.visit(`/question/${questionId}/notebook`);
    });

    cy.findByDisplayValue(questionName).should("be.visible");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(customFieldName).should("be.visible");
  });
});

describe("issue 28599", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID").parent().icon("close").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID").should("not.exist");
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
    H.startNewNativeQuestion();
    H.NativeEditor.type("SELECT * FROM ORDERS");
    H.saveQuestionToCollection("Q1");

    H.NativeEditor.focus().type(" WHERE TOTAL < 20");
    H.queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within((modal) => {
      cy.findByText("Save").click();
    });
    cy.wait("@updateQuestion");

    H.NativeEditor.focus().type(" LIMIT 10");
    H.queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within((modal) => {
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

    H.openVizSettingsSidebar();
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
    cy.intercept("GET", "/api/search*source*").as("searchSource");
    cy.intercept("GET", "/api/search*target*").as("searchTarget");
    cy.intercept("GET", "/api/card/**/query_metadata").as("queryMetadata");

    cy.visit("/");
    H.waitForLoaderToBeRemoved();

    cy.log("Create target question");
    H.newButton("Question").click();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Source question").click();
    });
    H.saveQuestion("Target question");
    cy.wait("@queryMetadata");

    cy.log("Update source question");
    H.commandPaletteButton().click();
    H.commandPaletteInput().type("source");
    cy.wait("@searchSource");
    H.commandPalette().findByText("Source question").click();
    cy.wait("@queryMetadata");
    cy.findByTestId("native-query-editor-container")
      .findByText("Open Editor")
      .click();
    H.NativeEditor.focus().type(" , 4 as D;");
    H.saveSavedQuestion();
    cy.wait("@queryMetadata");
    cy.wait(450); // let react process things (flaky test)

    cy.log("Assert updated metadata in target question");
    H.commandPaletteButton().click();
    H.commandPaletteInput().type("target");
    cy.wait("@searchTarget");
    H.commandPalette().findByText("Target question").click();
    cy.wait("@queryMetadata");
    cy.findAllByTestId("header-cell").eq(3).should("have.text", "D");
    H.openNotebook();
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("D").should("be.visible");
  });
});

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
    H.createQuestion(question).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      H.visitQuestion(id);
    });
  });

  it("should not show 'Save' after modifying minibar settings for a custom column", () => {
    goToExpressionSidebarVisualizationSettings();
    H.popover().within(() => {
      cy.findByLabelText("Show a mini bar chart")
        .click({ force: true })
        .should("be.checked");
    });
    saveModifiedQuestion();
  });

  it("should not show 'Save' after text formatting visualization settings", () => {
    goToExpressionSidebarVisualizationSettings();

    H.popover().within(() => {
      cy.findByLabelText("Display as").as("viewAsDropdown").click();
    });

    cy.findAllByRole("option", { name: "Email link" }).click();

    H.popover().within(() => {
      cy.findByDisplayValue("Email link").should("exist");
    });

    saveModifiedQuestion();
  });

  it("should not show 'Save' after saving viz settings from the custom column dropdown", () => {
    H.tableHeaderClick(EXPRESSION_NAME);
    H.popover().within(() => {
      cy.findByRole("button", { name: /gear icon/i }).click();
    });
    H.popover().within(() => {
      cy.findByLabelText("Show a mini bar chart")
        .click({ force: true })
        .should("be.checked");
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
  H.openVizSettingsSidebar();
  cy.findByTestId(`${EXPRESSION_NAME}-settings-button`).click();
}
