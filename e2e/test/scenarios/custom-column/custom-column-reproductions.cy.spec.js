import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addCustomColumn,
  enterCustomColumnDetails,
  getNotebookStep,
  entityPickerModal,
  popover,
  visualize,
  restore,
  startNewQuestion,
  queryBuilderMain,
  selectFilterOperator,
  entityPickerModalTab,
  withDatabase,
  summarize,
  cartesianChartCircle,
  openOrdersTable,
  openProductsTable,
  openNotebook,
  filter,
  visitDashboard,
  editDashboard,
  setFilter,
  filterWidget,
  visitQuestionAdhoc,
  addOrUpdateDashboardCard,
  modal,
  saveDashboard,
  selectDashboardFilter,
  getDashboardCard,
  visitQuestion,
  tableHeaderClick,
  resetTestTable,
  main,
  multiAutocompleteInput,
  createNativeQuestion,
} from "e2e/support/helpers";
import { createSegment } from "e2e/support/helpers/e2e-table-metadata-helpers";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

describe.skip("issue 12445", { tags: "@external" }, () => {
  const CC_NAME = "Abbr";
  beforeEach(() => {
    restore("mysql-8");
    cy.signInAsAdmin();
  });

  it("should correctly apply substring for a custom column (metabase#12445)", () => {
    withDatabase(2, ({ PEOPLE, PEOPLE_ID }) => {
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

    restore();
    cy.signInAsAdmin();

    openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();

    // Add custom column that will be used later in summarize (group by)
    enterCustomColumnDetails({ formula: "1 + 1", name: CC_NAME });
    cy.button("Done").click();
  });

  it("should allow 'zoom in' drill-through when grouped by custom column (metabase#13289) (metabase#13289)", () => {
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();

    popover().findByText(CC_NAME).click();

    cy.icon("add").last().click();

    popover().within(() => {
      cy.findByText("Created At").click();
    });

    visualize();

    cy.findByTestId("query-visualization-root").within(() => {
      cartesianChartCircle()
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
    restore("postgres-12");
    cy.signInAsAdmin();

    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText(PG_DB_NAME).should("be.visible").click();
      cy.findByTextEnsureVisible("People").click();
    });
  });

  it("should allow using strings in filter based on a custom column (metabase#13751)", () => {
    addCustomColumn();
    enterCustomColumnDetails({
      formula: 'regexextract([State], "^C[A-Z]")',
      name: CC_NAME,
    });
    cy.button("Done").click();

    getNotebookStep("filter")
      .findByText(/Add filter/)
      .click();
    popover().findByText(CC_NAME).click();
    selectFilterOperator("Is");
    popover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("CO");
      cy.button("Add filter").click();
    });

    visualize();

    queryBuilderMain().findByText("Arnold Adams").should("be.visible");
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
      restore("postgres-12");
      cy.signInAsAdmin();

      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(PG_DB_NAME).should("be.visible").click();
      cy.findByTextEnsureVisible("People").click();
    });

    it("should not remove regex escape characters (metabase#14517)", () => {
      cy.log("Create custom column using `regexextract()`");
      cy.icon("add_data").click();
      popover().within(() => {
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

    restore();
    cy.signInAsAdmin();
  });

  it("should correctly filter custom column by 'Not equal to' (metabase#14843)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    openNotebook();

    filter({ mode: "notebook" });
    popover().findByText(CC_NAME).click();
    selectFilterOperator("Not equal to");
    popover().within(() => {
      multiAutocompleteInput().type("3");
      cy.button("Add filter").click();
    });

    visualize();

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
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });
  });

  it("should not allow choosing text fields for SUM (metabase#18069)", () => {
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sum of ...").click();

    popover().within(() => {
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

    visualize();

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
    editDashboard();

    setFilter("Number", "Equal to");
  }

  function mapParameterToCustomColumn() {
    cy.findByTestId("dashcard-container").contains("Select…").click();
    popover().contains("Quantity_2").click({ force: true });
  }

  function addValueToParameterFilter() {
    filterWidget().click();
    popover().within(() => {
      cy.findByRole("textbox").type("14");
      cy.findByText("14").click();
      cy.button("Add filter").click();
    });
  }

  beforeEach(() => {
    restore();
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
          visitDashboard(dashboard_id);
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
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should be able to use a custom column in aggregation for a nested query (metabase#18814)", () => {
    openNotebook();

    cy.icon("sum").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().contains(ccName).click();

    visualize();

    cy.findByTestId("query-visualization-root").should("contain", "2022");
  });
});

describe.skip("issue 19744", () => {
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

    modal().button("Save").click();

    cy.findByText("Not now").click();

    cy.wait("@saveQuestion").then(({ response: { body } }) => {
      cy.wrap(body.id).as("questionId");
    });
  }

  function addQuestionToDashboardAndVisit() {
    cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
      cy.get("@questionId").then(card_id => {
        addOrUpdateDashboardCard({
          card_id,
          dashboard_id,
          card: { size_x: 21, size_y: 10 },
        });
      });

      visitDashboard(dashboard_id);
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // For this specific repro, it's crucial to first visit the question in order to load the `results_metadata`...
    visitQuestionAdhoc(questionDetails);
    // ...and then to save it using the UI
    saveQuestion("19744");

    addQuestionToDashboardAndVisit();
  });

  it("custom column after aggregation shouldn't limit or change the behavior of dashboard filters (metabase#19744)", () => {
    editDashboard();

    setFilter("Time", "All Options");

    cy.findByTestId("dashcard-container").contains("Select…").click();
    popover().contains("Created At");
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
        visitQuestion(card_id);

        // this should modify the query and remove the second stage
        openNotebook();
        updateExpressions();
        visualize();
        cy.findByTestId("viz-settings-button").click();
        cy.findByRole("button", { name: "Add or remove columns" }).click();
        cy.findByLabelText("Count").should("not.be.checked").click();
        updateQuestion();

        // as we select all columns in the first stage of the query,
        // it should be possible to map a filter to a selected column
        visitDashboard(dashboard_id);
        editDashboard();
        cy.findByText("Date filter").click();
        selectDashboardFilter(getDashboardCard(), "Created At");
        saveDashboard();
      },
    );
  }

  function removeExpression(name) {
    getNotebookStep("expression", { stage: 1 }).within(() => {
      cy.findByText(name).within(() => {
        cy.icon("close").click();
      });
    });
  }

  function removeAllExpressions() {
    getNotebookStep("expression", { stage: 1 }).within(() => {
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
    restore();
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
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should display custom column regardless of how many columns are selected (metabase#20229)", () => {
    ccAssertion();

    // Switch to the notebook view to deselect at least one column
    openNotebook();

    cy.findAllByTestId("fields-picker").click();
    popover().within(() => {
      unselectColumn("Tax");
    });

    visualize();

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
    restore();
    cy.signInAsAdmin();
    cy.createQuestion(questionDetails, { visitQuestion: true });
    openNotebook();
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
    restore();
    cy.signInAsAdmin();
  });

  it("should handle cc with the same name as an aggregation function (metabase#21513)", () => {
    openProductsTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    popover().findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().findByText("Category").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    enterCustomColumnDetails({
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
    restore();
    cy.signInAsAdmin();
  });

  it("should group by a custom column and work in a nested question (metabase#23862)", () => {
    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      visitQuestionAdhoc(
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
    restore();
    cy.signInAsAdmin();
    createSegment(segmentDetails);
  });

  it("should allow segments in case custom expressions (metabase#24922)", () => {
    openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    enterCustomColumnDetails(customColumnDetails);
    cy.button("Done").click();

    visualize();
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

    restore();
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
    filter();
    modal().within(() => {
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
    summarize();
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
      restore(`${dialect}-writable`);
      cy.signInAsAdmin();

      resetTestTable({ type: dialect, table: tableName });
      cy.request("POST", `/api/database/${WRITABLE_DB_ID}/sync_schema`);
    });

    it("should display all summarize options if the only numeric field is a custom column (metabase#27745)", () => {
      startNewQuestion();

      entityPickerModal().within(() => {
        cy.findByPlaceholderText("Search…").type("colors");
        cy.findByTestId("result-item")
          .contains(/colors/i)
          .click();
      });
      cy.icon("add_data").click();
      enterCustomColumnDetails({
        formula: "case([ID] > 1, 25, 5)",
        name: "Numeric",
      });
      cy.button("Done").click();

      visualize();

      tableHeaderClick("Numeric");
      popover().findByText(/^Sum$/).click();

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
    restore();
    cy.signInAsAdmin();
    cy.createQuestion({ query: QUERY }, { visitQuestion: true });
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow quick filter drills on custom columns", () => {
    cy.findByTestId("TableInteractive-root")
      .findAllByText("xavier")
      .eq(1)
      .click();
    popover().findByText("Is xavier").click();
    cy.wait("@dataset");
    main()
      .findByText(/There was a problem/i)
      .should("not.exist");
    cy.findByTestId("TableInteractive-root")
      .findAllByText("xavier")
      .should("have.length", 2);
  });
});

describe("issue 42949", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should correctly show available shortcuts for date and number columns (metabase#42949)", () => {
    createNativeQuestion(
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
    tableHeaderClick("CREATED_AT");
    popover().findByText("Extract day, month…").should("be.visible");
    popover().findByText("Combine columns").should("not.exist");
    cy.realPress("Escape");

    cy.log("Verify header drills - V");
    tableHeaderClick("V");
    popover().findByText("Extract part of column").should("not.exist");
    popover().findByText("Combine columns").should("not.exist");
    cy.realPress("Escape");

    cy.log("Verify plus button - extract column");
    cy.button("Add column").click();
    popover().findByText("Extract part of column").click();
    popover().findByText("CREATED_AT").click();
    popover().within(() => {
      cy.findByText("Day of month").should("be.visible");
      cy.findByText("Day of week").should("be.visible");
      cy.findByText("Month of year").should("be.visible");
      cy.findByText("Quarter of year").should("be.visible");
      cy.findByText("Year").should("be.visible").click();
    });
    cy.findAllByTestId("header-cell").eq(2).should("have.text", "Year");

    cy.log("Verify plus button - combine columns");
    cy.button("Add column").click();
    popover().findByText("Combine columns").click();
    popover().findAllByTestId("column-input").eq(0).click();
    popover()
      .last()
      .within(() => {
        cy.findByText("CREATED_AT").should("be.visible");
        cy.findByText("V").should("be.visible");
        cy.findByText("Year").should("be.visible").click();
      });
    popover().button("Done").click();

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
    createNativeQuestion(
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
    tableHeaderClick("N");
    popover().findByText("Extract part of column").should("not.exist");
    popover().findByText("Combine columns").should("not.exist");
    cy.realPress("Escape");

    cy.log("Verify plus button");
    cy.button("Add column").click();
    popover().findByText("Extract part of column").should("not.exist");
    popover().findByText("Combine columns").click();
    popover().findAllByTestId("column-input").eq(0).click();
    popover().last().findByText("N").should("be.visible");
  });

  it("should correctly show available shortcuts for a string column (metabase#42949)", () => {
    createNativeQuestion(
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
    tableHeaderClick("'abc'");
    popover().findByText("Extract part of column").should("not.exist");
    popover().findByText("Combine columns").should("be.visible");
    cy.realPress("Escape");

    cy.log("Verify plus button");
    cy.button("Add column").click();
    popover().findByText("Extract part of column").should("not.exist");
    popover().findByText("Combine columns").click();
    popover().findAllByTestId("column-input").eq(0).click();
    popover().last().findByText("'abc'").should("be.visible");
  });
});
