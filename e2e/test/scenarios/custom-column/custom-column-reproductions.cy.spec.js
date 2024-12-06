import { H } from "e2e/support";
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

describe.skip("issue 12445", { tags: "@external" }, () => {
  const CC_NAME = "Abbr";

  beforeEach(() => {
    H.restore("mysql-8");
    cy.signInAsAdmin();
  });

  it("should correctly apply substring for a custom column (metabase#12445)", () => {
    H.withDatabase(2, ({ PEOPLE, PEOPLE_ID }) => {
      cy.log("Create a question with `Source` column and abbreviated CC");
      cy.createQuestion(
        {
          name: "12445",
          query: {
            "source-table": PEOPLE_ID,
            breakout: [["expression", CC_NAME]],
            expressions: {
              [CC_NAME]: [
                "substring",
                ["field", PEOPLE.SOURCE, null],
                1,
                4, // we want 4 letter abbreviation
              ],
            },
          },
          database: 2,
        },
        { visitQuestion: true },
      );

      cy.findByText(CC_NAME);
      cy.findByText("Goog");
    });
  });
});

describe("issue 13289", () => {
  const CC_NAME = "Math";

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();

    H.openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();

    // Add custom column that will be used later in summarize (group by)
    H.enterCustomColumnDetails({ formula: "1 + 1", name: CC_NAME });
    cy.button("Done").click();
  });

  it("should allow 'zoom in' drill-through when grouped by custom column (metabase#13289) (metabase#13289)", () => {
    H.summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();

    H.popover().findByText(CC_NAME).click();

    cy.icon("add").last().click();

    H.popover().within(() => {
      cy.findByText("Created At").click();
    });

    H.visualize();

    cy.findByTestId("query-visualization-root").within(() => {
      H.cartesianChartCircle()
        .eq(5) // random circle in the graph (there is no specific reason for this index)
        .click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See this month by week").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At is Sep 1–30, 2022");
  });
});

describe("issue 13751", { tags: "@external" }, () => {
  const CC_NAME = "C-States";
  const PG_DB_NAME = "QA Postgres12";

  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();

    H.startNewQuestion();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText(PG_DB_NAME).should("be.visible").click();
      cy.findByTextEnsureVisible("People").click();
    });
  });

  it("should allow using strings in filter based on a custom column (metabase#13751)", () => {
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: 'regexextract([State], "^C[A-Z]")',
      name: CC_NAME,
    });
    cy.button("Done").click();

    H.getNotebookStep("filter")
      .findByText(/Add filter/)
      .click();
    H.popover().findByText(CC_NAME).click();
    H.selectFilterOperator("Is");
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("CO");
      cy.button("Add filter").click();
    });

    H.visualize();

    H.queryBuilderMain().findByText("Arnold Adams").should("be.visible");
  });
});

describe.skip(
  "postgres > question > custom columns",
  { tags: "@external" },
  () => {
    const PG_DB_NAME = "QA Postgres12";

    // Ironically, both Prettier and Cypress remove escape characters from our code as well
    // We're testing for the literal sting `(?<=\/\/)[^\/]*`, but we need to escape the escape characters to make it work
    const ESCAPED_REGEX = "(?<=\\/\\/)[^\\/]*";

    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();

      H.startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(PG_DB_NAME).should("be.visible").click();
      cy.findByTextEnsureVisible("People").click();
    });

    it("should not remove regex escape characters (metabase#14517)", () => {
      cy.log("Create custom column using `regexextract()`");
      cy.findByLabelText("Custom Column").click();
      H.popover().within(() => {
        cy.get("[contenteditable='true']")
          .type(`regexextract([State], "${ESCAPED_REGEX}")`)
          .blur();

        // It removes escaped characters already on blur
        cy.log("Reported failing on v0.36.4");
        cy.contains(ESCAPED_REGEX);
      });
    });
  },
);

describe("issue 14843", () => {
  const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;
  const CC_NAME = "City Length";

  const questionDetails = {
    name: "14843",
    query: {
      "source-table": PEOPLE_ID,
      expressions: { [CC_NAME]: ["length", ["field", PEOPLE.CITY, null]] },
    },
  };

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();
  });

  it("should correctly filter custom column by 'Not equal to' (metabase#14843)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();

    H.filter({ mode: "notebook" });
    H.popover().findByText(CC_NAME).click();
    H.selectFilterOperator("Not equal to");
    H.popover().within(() => {
      H.multiAutocompleteInput().type("3");
      cy.button("Add filter").click();
    });

    H.visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${CC_NAME} is not equal to 3`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rye").should("not.exist");
  });
});

describe("issue 18069", () => {
  const questionDetails = {
    name: "18069",
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        ["CC_Category"]: ["field", PRODUCTS.CATEGORY, null],
        ["CC_LowerVendor"]: ["lower", ["field", PRODUCTS.VENDOR, null]],
        ["CC_UpperTitle"]: ["upper", ["field", PRODUCTS.TITLE, null]],
        ["CC_HalfPrice"]: ["/", ["field", PRODUCTS.PRICE, null], 2],
        ["CC_ScaledRating"]: ["*", 1.5, ["field", PRODUCTS.RATING, null]],
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });
  });

  it("should not allow choosing text fields for SUM (metabase#18069)", () => {
    H.summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sum of ...").click();

    H.popover().within(() => {
      // regular fields
      cy.findByText("Price");
      cy.findByText("Rating");

      // custom columns not suitable for SUM
      cy.findByText("CC_Category").should("not.exist");
      cy.findByText("CC_LowerVendor").should("not.exist");
      cy.findByText("CC_UpperTitle").should("not.exist");

      // custom columns suitable for SUM
      cy.findByText("CC_HalfPrice");
      cy.findByText("CC_ScaledRating").click();
    });

    H.visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1,041.45");
  });
});

describe("issue 18747", () => {
  const questionDetails = {
    name: "18747",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        ["Quantity_2"]: ["field", ORDERS.QUANTITY, null],
      },
    },
  };
  function addNumberParameterToDashboard() {
    H.editDashboard();

    H.setFilter("Number", "Equal to");
  }

  function mapParameterToCustomColumn() {
    cy.findByTestId("dashcard-container").contains("Select…").click();
    H.popover().contains("Quantity_2").click({ force: true });
  }

  function addValueToParameterFilter() {
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByRole("searchbox").type("14");
      cy.button("Add filter").click();
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 8,
            },
          ],
        }).then(() => {
          H.visitDashboard(dashboard_id);
        });
      },
    );
  });

  it("should correctly filter the table with a number parameter mapped to the custom column Quantity_2", () => {
    addNumberParameterToDashboard();
    mapParameterToCustomColumn();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();
    // wait for saving to finish
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("You're editing this dashboard.").should("not.exist");

    addValueToParameterFilter();

    cy.get(".CardVisualization tbody > tr").should("have.length", 1);

    // check that the parameter value is parsed correctly on page load
    cy.reload();
    cy.get(".LoadingSpinner").should("not.exist");

    cy.get(".CardVisualization tbody > tr").should("have.length", 1);
  });
});

describe("issue 18814", () => {
  const ccName = "Custom Created At";

  const questionDetails = {
    name: "18814",
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      expressions: {
        [ccName]: ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should be able to use a custom column in aggregation for a nested query (metabase#18814)", () => {
    H.openNotebook();

    cy.icon("sum").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    H.popover().contains(ccName).click();

    H.visualize();

    cy.findByTestId("query-visualization-root").should("contain", "2022");
  });
});

describe("issue 19744", () => {
  const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

  const questionDetails = {
    dataset_query: {
      type: "query",
      query: {
        "source-query": {
          "source-table": PRODUCTS_ID,
          aggregation: [
            ["count"],
            ["sum", ["field", PRODUCTS.PRICE, null]],
            ["sum", ["field", PRODUCTS.RATING, null]],
          ],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
        expressions: { Math: ["+", 1, 1] },
      },
      database: SAMPLE_DB_ID,
    },
    display: "bar",
  };
  function saveQuestion(name) {
    cy.intercept("POST", "/api/card").as("saveQuestion");

    cy.findByText("Save").click();
    cy.findByLabelText("Name").type(name);

    H.modal().button("Save").click();

    cy.findByText("Not now").click();

    cy.wait("@saveQuestion").then(({ response: { body } }) => {
      cy.wrap(body.id).as("questionId");
    });
  }

  function addQuestionToDashboardAndVisit() {
    cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
      cy.get("@questionId").then(card_id => {
        H.addOrUpdateDashboardCard({
          card_id,
          dashboard_id,
          card: { size_x: 21, size_y: 10 },
        });
      });

      H.visitDashboard(dashboard_id);
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    // For this specific repro, it's crucial to first visit the question in order to load the `results_metadata`...
    H.visitQuestionAdhoc(questionDetails);
    // ...and then to save it using the UI
    saveQuestion("19744");

    addQuestionToDashboardAndVisit();
  });

  it("custom column after aggregation shouldn't limit or change the behavior of dashboard filters (metabase#19744)", () => {
    H.editDashboard();

    H.setFilter("Date picker", "All Options");

    cy.findByTestId("dashcard-container").contains("Select…").click();
    H.popover().contains("Created At");
  });
});

describe("issue 19745", () => {
  const questionDetails = {
    display: "table",
    query: {
      "source-query": {
        "source-table": PRODUCTS_ID,
        aggregation: [
          ["count"],
          ["sum", ["field", PRODUCTS.PRICE, { "base-type": "type/Float" }]],
        ],
        breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
      },
      fields: [
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        ["field", "sum", { "base-type": "type/Float" }],
        ["expression", "Custom Column"],
      ],
      expressions: {
        "Custom Column": ["+", 1, 1],
      },
    },
  };

  const filterDetails = {
    id: "b6f1865b",
    name: "Date filter",
    slug: "date",
    type: "date/month-year",
    sectionId: "date",
  };

  const dashboardDetails = {
    name: "Filters",
    parameters: [filterDetails],
  };

  function updateQuestionAndSelectFilter(updateExpressions) {
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { card_id, dashboard_id } }) => {
        H.visitQuestion(card_id);

        // this should modify the query and remove the second stage
        H.openNotebook();
        updateExpressions();
        H.visualize();
        cy.findByTestId("viz-settings-button").click();
        cy.findByRole("button", { name: "Add or remove columns" }).click();
        cy.findByLabelText("Count").should("not.be.checked").click();
        updateQuestion();

        // as we select all columns in the first stage of the query,
        // it should be possible to map a filter to a selected column
        H.visitDashboard(dashboard_id);
        H.editDashboard();
        cy.findByText("Date filter").click();
        H.selectDashboardFilter(H.getDashboardCard(), "Created At");
        H.saveDashboard();
      },
    );
  }

  function removeExpression(name) {
    H.getNotebookStep("expression", { stage: 1 }).within(() => {
      cy.findByText(name).within(() => {
        cy.icon("close").click();
      });
    });
  }

  function removeAllExpressions() {
    H.getNotebookStep("expression", { stage: 1 }).within(() => {
      cy.findByLabelText("Remove step").click({ force: true });
    });
  }

  function updateQuestion() {
    cy.intercept("PUT", "/api/card/*").as("updateQuestion");
    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@updateQuestion");
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should unwrap the nested query when removing the last expression (metabase#19745)", () => {
    updateQuestionAndSelectFilter(() => removeExpression("Custom Column"));
  });

  it("should unwrap the nested query when removing all expressions (metabase#19745)", () => {
    updateQuestionAndSelectFilter(() => removeAllExpressions());
  });
});

describe("issue 20229", () => {
  const questionDetails = {
    name: "20229",
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        Adjective: [
          "case",
          [[[">", ["field", ORDERS.TOTAL, null], 100], "expensive"]],
          { default: "cheap" },
        ],
      },
      limit: 10,
    },
  };
  function ccAssertion() {
    cy.findByText("Adjective");
    cy.contains("expensive");
    cy.contains("cheap");
  }

  function unselectColumn(column) {
    cy.findByText(column).siblings().find(".Icon-check").click({ force: true });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should display custom column regardless of how many columns are selected (metabase#20229)", () => {
    ccAssertion();

    // Switch to the notebook view to deselect at least one column
    H.openNotebook();

    cy.findAllByTestId("fields-picker").click();
    H.popover().within(() => {
      unselectColumn("Tax");
    });

    H.visualize();

    ccAssertion();
  });
});

describe("issue 21135", () => {
  const questionDetails = {
    name: "21135",
    query: {
      "source-table": PRODUCTS_ID,
      limit: 5,
      expressions: { Price: ["+", ["field", PRODUCTS.PRICE, null], 2] },
    },
  };

  function previewCustomColumnNotebookStep() {
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.findByTestId("step-expression-0-0").find(".Icon-play").click();

    cy.wait("@dataset");
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();
  });

  it("should handle cc with the same name as the table column (metabase#21135)", () => {
    cy.findAllByTestId("notebook-cell-item").contains("Price").click();
    cy.button("Update").click();

    previewCustomColumnNotebookStep();

    // We should probably use data-testid or some better selector but it is crucial
    // to narrow the results to the preview area to avoid false positive result.
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Rustic Paper Wallet");

      cy.findAllByText("Price").should("have.length", 2);

      cy.findByText("29.46"); // actual Price column
      cy.findByText("31.46"); // custom column
    });
  });
});

describe("issue 21513", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should handle cc with the same name as an aggregation function (metabase#21513)", () => {
    H.openProductsTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.popover().findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    H.popover().findByText("Category").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    H.enterCustomColumnDetails({
      formula: "[Count] * 2",
      name: "Double Count",
    });
    cy.button("Done").should("not.be.disabled");
  });
});

describe("issue 23862", () => {
  const questionDetails = {
    name: "23862",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        CC: [
          "case",
          [[[">", ["field", ORDERS.TOTAL, null], 10], "Large"]],
          {
            default: "Small",
          },
        ],
      },
      aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      breakout: [["expression", "CC"]],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should group by a custom column and work in a nested question (metabase#23862)", () => {
    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      H.visitQuestionAdhoc(
        {
          dataset_query: {
            type: "query",
            query: {
              "source-table": `card__${id}`,
            },
            database: SAMPLE_DB_ID,
          },
          display: "table",
        },
        {
          callback: xhr => expect(xhr.response.body.error).not.to.exist,
        },
      );
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Small");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("-36.53");
  });
});

describe("issue 24922", () => {
  const segmentDetails = {
    name: "OrdersSegment",
    description: "All orders with a total under $100.",
    table_id: ORDERS_ID,
    definition: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      filter: ["<", ["field", ORDERS.TOTAL, null], 100],
    },
  };

  const customColumnDetails = {
    name: "CustomColumn",
    formula: 'case([OrdersSegment], "Segment", "Other")',
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.createSegment(segmentDetails);
  });

  it("should allow segments in case custom expressions (metabase#24922)", () => {
    H.openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    H.enterCustomColumnDetails(customColumnDetails);
    cy.button("Done").click();

    H.visualize();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("CustomColumn").should("be.visible");
  });
});

describe.skip("issue 25189", () => {
  const ccTable = "Custom Created";
  const ccFunction = "Custom Total";

  const questionDetails = {
    name: "25189",
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
      expressions: {
        [ccTable]: ["field", ORDERS.CREATED_AT, null],
        [ccFunction]: [
          "case",
          [[[">", ["field", ORDERS.TOTAL, null], 100], "Yay"]],
          {
            default: "Nay",
          },
        ],
      },
    },
  };

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(
      ({ body: { id: baseQuestionId } }) => {
        cy.createQuestion(
          {
            name: "Nested 25189",
            query: { "source-table": `card__${baseQuestionId}` },
          },
          { visitQuestion: true },
        );
      },
    );
  });

  it("custom column referencing only a single column should not be dropped in a nested question (metabase#25189)", () => {
    // 1. Column should not be dropped
    cy.findAllByTestId("header-cell")
      .should("contain", ccFunction)
      .and("contain", ccTable);

    // 2. We shouldn't see duplication in the bulk filter modal
    H.filter();
    H.modal().within(() => {
      // Implicit assertion - will fail if more than one element is found
      cy.findByText(ccFunction);
      cy.findByText(ccTable);

      cy.findByText("Today").click();
      cy.button("Apply Filters").click();
    });

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No results!");

    // 3. We shouldn't see duplication in the breakout fields
    H.summarize();
    cy.findByTestId("sidebar-content").within(() => {
      // Another implicit assertion
      cy.findByText(ccFunction);
      cy.findByText(ccTable);
    });
  });
});

["postgres", "mysql"].forEach(dialect => {
  describe(`issue 27745 (${dialect})`, { tags: "@external" }, () => {
    const tableName = "colors27745";

    beforeEach(() => {
      H.restore(`${dialect}-writable`);
      cy.signInAsAdmin();

      H.resetTestTable({ type: dialect, table: tableName });
      cy.request("POST", `/api/database/${WRITABLE_DB_ID}/sync_schema`);
      cy.intercept("GET", "/api/search*").as("search");
    });

    it("should display all summarize options if the only numeric field is a custom column (metabase#27745)", () => {
      H.startNewQuestion();

      H.entityPickerModal().within(() => {
        cy.findByPlaceholderText("Search this collection or everywhere…").type(
          "colors",
        );
        cy.findByText("Everywhere").click();
        cy.wait("@search");
        cy.findByTestId("result-item")
          .contains(/colors/i)
          .click();
      });
      cy.findByLabelText("Custom column").click();
      H.enterCustomColumnDetails({
        formula: "case([ID] > 1, 25, 5)",
        name: "Numeric",
      });
      cy.button("Done").click();

      H.visualize();

      H.tableHeaderClick("Numeric");
      H.popover().findByText(/^Sum$/).click();

      cy.wait("@dataset");
      cy.findByTestId("scalar-value").invoke("text").should("eq", "55");

      cy.findByTestId("sidebar-right")
        .should("be.visible")
        .within(() => {
          cy.findByTestId("aggregation-item").should(
            "contain",
            "Sum of Numeric",
          );
        });
    });
  });
});

describe("issue 32032", () => {
  const QUERY = {
    "source-table": REVIEWS_ID,
    expressions: {
      "Custom Reviewer": ["field", REVIEWS.REVIEWER, null],
    },
    fields: [
      ["field", REVIEWS.ID, { "base-type": "type/BigInteger" }],
      ["field", REVIEWS.REVIEWER, { "base-type": "type/Text" }],
      ["expression", "Custom Reviewer", { "base-type": "type/Text" }],
    ],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.createQuestion({ query: QUERY }, { visitQuestion: true });
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow quick filter drills on custom columns", () => {
    cy.findByTestId("TableInteractive-root")
      .findAllByText("xavier")
      .eq(1)
      .click();
    H.popover().findByText("Is xavier").click();
    cy.wait("@dataset");
    H.main()
      .findByText(/There was a problem/i)
      .should("not.exist");
    cy.findByTestId("TableInteractive-root")
      .findAllByText("xavier")
      .should("have.length", 2);
  });
});

describe("issue 42949", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should correctly show available shortcuts for date and number columns (metabase#42949)", () => {
    H.createNativeQuestion(
      {
        native: {
          query: `
            SELECT DATE '2024-05-21' AS created_at, null as v
            UNION ALL SELECT DATE '2024-05-20', 1
            UNION ALL SELECT DATE '2024-05-19', 2
            ORDER BY created_at
          `,
        },
      },
      { visitQuestion: true },
    );
    cy.findByTestId("qb-header").findByText("Explore results").click();

    cy.log("Verify header drills - CREATED_AT");
    H.tableHeaderClick("CREATED_AT");
    H.popover().findByText("Extract day, month…").should("be.visible");
    H.popover().findByText("Combine columns").should("not.exist");
    cy.realPress("Escape");

    cy.log("Verify header drills - V");
    H.tableHeaderClick("V");
    H.popover().findByText("Extract part of column").should("not.exist");
    H.popover().findByText("Combine columns").should("not.exist");
    cy.realPress("Escape");

    cy.log("Verify plus button - extract column");
    cy.button("Add column").click();
    H.popover().findByText("Extract part of column").click();
    H.popover().findByText("CREATED_AT").click();
    H.popover().within(() => {
      cy.findByText("Day of month").should("be.visible");
      cy.findByText("Day of week").should("be.visible");
      cy.findByText("Month of year").should("be.visible");
      cy.findByText("Quarter of year").should("be.visible");
      cy.findByText("Year").should("be.visible").click();
    });
    cy.findAllByTestId("header-cell").eq(2).should("have.text", "Year");

    cy.log("Verify plus button - combine columns");
    cy.button("Add column").click();
    H.popover().findByText("Combine columns").click();
    H.popover().findAllByTestId("column-input").eq(0).click();
    H.popover()
      .last()
      .within(() => {
        cy.findByText("CREATED_AT").should("be.visible");
        cy.findByText("V").should("be.visible");
        cy.findByText("Year").should("be.visible").click();
      });
    H.popover().button("Done").click();

    cy.findAllByTestId("header-cell")
      .eq(3)
      .should("have.text", "Combined Year, V");

    cy.findAllByTestId("cell-data").eq(6).should("have.text", "2,024");
    cy.findAllByTestId("cell-data").eq(7).should("have.text", "2024 2");
    cy.findAllByTestId("cell-data").eq(10).should("have.text", "2,024");
    cy.findAllByTestId("cell-data").eq(11).should("have.text", "2024 1");
    cy.findAllByTestId("cell-data").eq(13).should("have.text", "2,024");
    cy.findAllByTestId("cell-data").eq(14).should("have.text", "2024 ");
  });

  it("should correctly show available shortcuts for a number column (metabase#42949)", () => {
    H.createNativeQuestion(
      {
        native: {
          query: "select 1 as n",
        },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("qb-header").findByText("Explore results").click();
    cy.findByLabelText("Switch to data").click();

    cy.log("Verify header drills");
    H.tableHeaderClick("N");
    H.popover().findByText("Extract part of column").should("not.exist");
    H.popover().findByText("Combine columns").should("not.exist");
    cy.realPress("Escape");

    cy.log("Verify plus button");
    cy.button("Add column").click();
    H.popover().findByText("Extract part of column").should("not.exist");
    H.popover().findByText("Combine columns").click();
    H.popover().findAllByTestId("column-input").eq(0).click();
    H.popover().last().findByText("N").should("be.visible");
  });

  it("should correctly show available shortcuts for a string column (metabase#42949)", () => {
    H.createNativeQuestion(
      {
        native: {
          query: "select 'abc'",
        },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("qb-header").findByText("Explore results").click();
    cy.findByLabelText("Switch to data").click();

    cy.log("Verify header drills");
    H.tableHeaderClick("'abc'");
    H.popover().findByText("Extract part of column").should("not.exist");
    H.popover().findByText("Combine columns").should("be.visible");
    cy.realPress("Escape");

    cy.log("Verify plus button");
    cy.button("Add column").click();
    H.popover().findByText("Extract part of column").should("not.exist");
    H.popover().findByText("Combine columns").click();
    H.popover().findAllByTestId("column-input").eq(0).click();
    H.popover().last().findByText("'abc'").should("be.visible");
  });
});

describe("issue 49342", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to leave the expression input with the Tab key (metabase#49342)", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();
    H.enterCustomColumnDetails({ formula: "[Tot{Enter}", blur: false });
    cy.get(".ace_text-input").first().focus().realPress("Tab");
    cy.findByTestId("expression-name").should("be.focused");

    cy.log("should contain focus within the popover");
    cy.findByTestId("expression-name").realPress(["Shift", "Tab"]);
    cy.get(".ace_text-input")
      .first()
      .should("be.focused")
      .realPress(["Shift", "Tab"]);
    cy.button("Cancel").should("be.focused");
  });
});

describe("issue 49882", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset/query_metadata").as("queryMetadata");

    H.openOrdersTable({ mode: "notebook" });
    cy.wait("@queryMetadata");
    cy.findByLabelText("Custom column").click();
  });

  it("should not eat up subsequent characters when applying a suggestion (metabase#49882-1)", () => {
    const moveCursorTo2ndCaseArgument = "{leftarrow}".repeat(6);
    H.enterCustomColumnDetails({
      formula: `case([Total] > 200, , "X")${moveCursorTo2ndCaseArgument}[tot{enter}`,
    });

    cy.get(".ace_text-input")
      .first()
      .should("have.value", 'case([Total] > 200, [Total] , "X")\n\n');
    H.popover()
      .findByText("Expecting a closing parenthesis")
      .should("not.exist");
  });

  it("does not clear expression input when expression is invalid (metabase#49882-2)", () => {
    const selectTax = `{leftarrow}${"{shift+leftarrow}".repeat(5)}`;
    const moveCursorBefore2ndCase = "{leftarrow}".repeat(41);
    H.enterCustomColumnDetails({
      formula: `case([Tax] > 1, case([Total] > 200, [Total], "Nothing"), [Tax])${selectTax}`,
    });
    cy.get(".ace_text-input").first().focus().realPress(["Control", "X"]);
    cy.get(".ace_text-input")
      .first()
      .focus()
      .type(moveCursorBefore2ndCase)
      .realPress(["Control", "V"]);
    cy.get(".ace_text-input").first().focus().type(" ").blur();

    cy.get(".ace_text-input")
      .first()
      .focus()
      .should(
        "have.value",
        'case([Tax] > 1, [Tax] case([Total] > 200, [Total], "Nothing"), )\n\n',
      );

    H.popover().findByText("Invalid expression").should("be.visible");
  });

  it("should allow moving cursor between wrapped lines with arrow up and arrow down keys (metabase#49882-3)", () => {
    H.enterCustomColumnDetails({
      formula:
        'case([Tax] > 1, case([Total] > 200, [Total], "Nothing"), [Tax]){leftarrow}{leftarrow}{uparrow}x{downarrow}y',
    });

    cy.get(".ace_text-input")
      .first()
      .should(
        "have.value",
        'case([Tax] > 1, xcase([Total] > 200, [Total], "Nothing"), [Tax]y)\n\n',
      );
  });

  it("should update currently selected suggestion when suggestions list is updated (metabase#49882-4)", () => {
    const selectProductVendor =
      "{downarrow}{downarrow}{downarrow}{downarrow}{downarrow}{enter}";
    H.enterCustomColumnDetails({
      formula: `[Product${selectProductVendor}{leftarrow}{leftarrow}`,
      blur: false,
    });

    cy.findByTestId("expression-suggestions-list-item")
      .should("have.text", "Product → Vendor")
      .and("have.css", "background-color", "rgb(80, 158, 227)");
  });
});

describe("issue 49304", () => {
  const questionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to switch between filter widgets and the expression editor for multi-argument operators (metabase#49304)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();

    cy.log(
      "add a filter using a filter widget and check that it is rendered in the expression editor",
    );
    H.getNotebookStep("data").button("Filter").click();
    H.popover().findByText("Category").click();
    H.selectFilterOperator("Contains");
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("gadget,widget");
      cy.button("Add filter").click();
    });
    H.getNotebookStep("filter")
      .findByText("Category contains 2 selections")
      .click();
    H.popover().within(() => {
      cy.button("Back").click();
      cy.findByText("Custom Expression").click();
      cy.get(".ace_content").should(
        "have.text",
        'contains([Category], "gadget", "widget", "case-insensitive")',
      );
    });

    cy.log(
      "modify the expression in the expression editor and make sure it is rendered correctly in the filter widget",
    );
    H.popover().within(() => {
      H.enterCustomColumnDetails({
        formula:
          'contains([Category], "gadget", "widget", "gizmo", "case-insensitive")',
      });
      cy.button("Done").click();
    });
    H.getNotebookStep("filter")
      .findByText("Category contains 3 selections")
      .click();
    H.popover().within(() => {
      cy.findByText("gadget").should("be.visible");
      cy.findByText("widget").should("be.visible");
      cy.findByText("gizmo").should("be.visible");
      cy.findByLabelText("Case sensitive").should("not.be.checked");
    });

    cy.log(
      "change options in the filter widget and make sure they get reflected in the expression editor",
    );
    H.popover().within(() => {
      cy.findByLabelText("Case sensitive").click();
      cy.button("Update filter").click();
    });
    H.getNotebookStep("filter")
      .findByText("Category contains 3 selections")
      .click();
    H.popover().within(() => {
      cy.button("Back").click();
      cy.findByText("Custom Expression").click();
      cy.get(".ace_content").should(
        "have.text",
        'contains([Category], "gadget", "widget", "gizmo")',
      );
    });

    cy.log(
      "remove options from the expression in the expression editor and make sure it is rendered correctly in the filter widget",
    );
    H.popover().within(() => {
      H.enterCustomColumnDetails({
        formula: 'contains([Category], "gadget", "widget", "gizmo")',
      });
      cy.button("Done").click();
    });
    H.getNotebookStep("filter")
      .findByText("Category contains 3 selections")
      .click();
    H.popover().within(() => {
      cy.findByText("gadget").should("be.visible");
      cy.findByText("widget").should("be.visible");
      cy.findByText("gizmo").should("be.visible");
      cy.findByLabelText("Case sensitive").should("be.checked");
    });
  });
});
