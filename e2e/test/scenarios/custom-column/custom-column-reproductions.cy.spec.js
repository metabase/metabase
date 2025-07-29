const { H } = cy;
import { dedent } from "ts-dedent";

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
      H.createQuestion(
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

  it("should allow 'zoom in' drill-through when grouped by custom column (metabase#13289)", () => {
    H.summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();

    H.popover().findByText(CC_NAME).click();

    // eslint-disable-next-line no-unsafe-element-filtering
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
      formula: 'regexExtract([State], "^C[A-Z]")',
      name: CC_NAME,
    });
    cy.button("Done").should("not.be.disabled").click();

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
      cy.log("Create custom column using `regexExtract()`");
      cy.findByLabelText("Custom Column").click();
      H.popover().within(() => {
        cy.get("[contenteditable='true']")
          .type(`regexExtract([State], "${ESCAPED_REGEX}")`)
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
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();

    H.filter({ mode: "notebook" });
    H.popover().findByText(CC_NAME).click();
    H.selectFilterOperator("Not equal to");
    H.clauseStepPopover().within(() => {
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

    H.createQuestion(questionDetails).then(({ body: { id: QUESTION_ID } }) => {
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
    H.dashboardParametersPopover().within(() => {
      H.fieldValuesCombobox().type("14");
      cy.button("Add filter").click();
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({ questionDetails }).then(
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

    H.tableInteractiveBody().findAllByRole("row").should("have.length", 1);

    // check that the parameter value is parsed correctly on page load
    cy.reload();
    cy.get(".LoadingSpinner").should("not.exist");

    H.tableInteractiveBody().findAllByRole("row").should("have.length", 1);
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

    H.createQuestion(questionDetails, { visitQuestion: true });
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

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("custom column after aggregation shouldn't limit or change the behavior of dashboard filters (metabase#19744)", () => {
    // For this specific repro, it's crucial to first visit the question in order to load the `results_metadata`...
    H.visitQuestionAdhoc(questionDetails);
    // ...and then to save it using the UI
    H.saveQuestion("19744");

    H.setFilter("Date picker", "All Options");

    H.getDashboardCard(1).findByText("Select…").click();
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
    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { card_id, dashboard_id } }) => {
        H.visitQuestion(card_id);

        // this should modify the query and remove the second stage
        H.openNotebook();
        updateExpressions();
        H.visualize();
        H.openVizSettingsSidebar();
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
    cy.findByTestId("save-question-modal").within((modal) => {
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

    H.createQuestion(questionDetails, { visitQuestion: true });
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
    H.createQuestion(questionDetails, { visitQuestion: true });
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
    H.createQuestion(questionDetails).then(({ body: { id } }) => {
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
          callback: (xhr) => expect(xhr.response.body.error).not.to.exist,
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

    H.createQuestion(questionDetails).then(
      ({ body: { id: baseQuestionId } }) => {
        H.createQuestion(
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

["postgres" /*, "mysql" */].forEach((dialect) => {
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
        H.entityPickerModalTab("Collections").click();
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
    H.createQuestion({ query: QUERY }, { visitQuestion: true });
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow quick filter drills on custom columns", () => {
    H.tableInteractive().findAllByText("xavier").eq(1).click();
    H.popover().findByText("Is xavier").click();
    cy.wait("@dataset");
    H.main()
      .findByText(/There was a problem/i)
      .should("not.exist");
    H.tableInteractive().findAllByText("xavier").should("have.length", 2);
  });
});

// broken. see https://github.com/metabase/metabase/issues/55673
describe.skip("issue 42949", () => {
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
    H.popover({ skipVisibilityCheck: true }).should("not.be.visible");

    cy.log("Verify header drills - V");
    H.tableHeaderClick("V");
    H.popover().findByText("Extract part of column").should("not.exist");
    H.popover().findByText("Combine columns").should("not.exist");
    cy.realPress("Escape");
    H.popover({ skipVisibilityCheck: true }).should("not.be.visible");

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
    // eslint-disable-next-line no-unsafe-element-filtering
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
    H.popover({ skipVisibilityCheck: true }).should("not.be.visible");

    cy.log("Verify plus button");
    cy.button("Add column").click();
    H.popover().findByText("Extract part of column").should("not.exist");
    H.popover().findByText("Combine columns").click();
    H.popover().findAllByTestId("column-input").eq(0).click();
    // eslint-disable-next-line no-unsafe-element-filtering
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
    H.popover({ skipVisibilityCheck: true }).should("not.be.visible");

    cy.log("Verify plus button");
    cy.button("Add column").click();
    H.popover().findByText("Extract part of column").should("not.exist");
    H.popover().findByText("Combine columns").click();
    H.popover().findAllByTestId("column-input").eq(0).click();
    // eslint-disable-next-line no-unsafe-element-filtering
    H.popover().last().findByText("'abc'").should("be.visible");
  });
});

describe("issue 49342", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not be possible to leave the expression input with the Tab key ", () => {
    // This test used to be a repro for #49342, but the product feature changed
    // so that the expression input can no longer be tabbed out of.

    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();
    H.enterCustomColumnDetails({ formula: "[Tot{Enter}", blur: false });
    cy.realPress("Tab");
    H.CustomExpressionEditor.value().should("equal", "[Total]  ");
    H.CustomExpressionEditor.nameInput().should("not.be.focused");

    cy.log("Shift-tab from name input should stay within the popover");
    H.CustomExpressionEditor.nameInput().focus();
    H.CustomExpressionEditor.nameInput().realPress(["Shift", "Tab"]);
    H.CustomExpressionEditor.nameInput().realPress(["Shift", "Tab"]);
    H.CustomExpressionEditor.nameInput().realPress(["Shift", "Tab"]);
    cy.focused().should("have.attr", "role", "textbox");

    cy.realPress(["Shift", "Tab"]);
    cy.button("Cancel").should("be.focused");

    cy.realPress(["Shift", "Tab"]);
    H.CustomExpressionEditor.nameInput().should("be.focused");
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
      formula: `case([Total] > 200, , "X")${moveCursorTo2ndCaseArgument}[tot`,
      blur: false,
    });

    H.CustomExpressionEditor.completions().should("be.visible");
    cy.realPress("Enter", { pressDelay: 10 });

    H.CustomExpressionEditor.value().should(
      "equal",
      'case([Total] > 200, [Total], "X")',
    );
    H.popover()
      .findByText("Expecting a closing parenthesis")
      .should("not.exist");
  });

  it("does not clear expression input when expression is invalid (metabase#49882-2, metabase#15892)", () => {
    // This test used to use keyboard shortcuts to cut and paste but this
    // seem impossible to emulate with CodeMirror in Cypress, so it's using
    // a synthetic paste event instead.
    // Copy is impossible to emulate so far, but it's not crucial to test the issue.

    H.enterCustomColumnDetails({
      formula:
        'case([Tax] > 1, case([Total] > 200, [Total], "Nothing"), [Tax])',
      blur: false,
    });

    // "Cut" [Tax]
    H.CustomExpressionEditor.type("{end}{leftarrow}", {
      focus: false,
      blur: false,
    });
    cy.realPress(["Shift", "ArrowLeft"]);
    cy.realPress(["Shift", "ArrowLeft"]);
    cy.realPress(["Shift", "ArrowLeft"]);
    cy.realPress(["Shift", "ArrowLeft"]);
    cy.realPress(["Shift", "ArrowLeft"]);
    cy.realPress(["Backspace"]);

    H.CustomExpressionEditor.type("{leftarrow}".repeat(42), {
      focus: false,
      blur: false,
    });

    // Paste [Tax] before case
    H.CustomExpressionEditor.paste("[Tax]");

    H.CustomExpressionEditor.value().should(
      "equal",
      'case([Tax] > 1,[Tax] case([Total] > 200, [Total], "Nothing"), )',
    );

    H.popover()
      .findByText("Expecting operator but got case instead")
      .should("be.visible", { timeout: 5000 });
  });

  // TODO: we no longer have wrapped lines (for now)
  it.skip("should allow moving cursor between wrapped lines with arrow up and arrow down keys (metabase#49882-3)", () => {
    H.enterCustomColumnDetails({
      formula:
        'case([Tax] > 1, case([Total] > 200, [Total], "Nothing"), [Tax]){leftarrow}{leftarrow}{uparrow}x{downarrow}y',
    });

    H.CustomExpressionEditor.value().should(
      "equal",
      'case([Tax] > 1, xcase([Total] > 200, [Total], "Nothing"), [Tax]y)',
    );
  });

  it("should update currently selected suggestion when suggestions list is updated (metabase#49882-4)", () => {
    const selectProductVendor =
      "{downarrow}{downarrow}{downarrow}{downarrow}{downarrow}";

    H.enterCustomColumnDetails({
      formula: `[Produ${selectProductVendor}`,
      blur: false,
    });

    H.CustomExpressionEditor.completion("Product → Vendor").should(
      "be.visible",
    );
    H.CustomExpressionEditor.acceptCompletion("tab");

    H.CustomExpressionEditor.value().should("equal", "[Product → Vendor]");
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
    H.clauseStepPopover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("gadget,widget");
      cy.button("Add filter").click();
    });
    H.getNotebookStep("filter")
      .findByText("Category contains 2 selections")
      .click();
    H.clauseStepPopover().within(() => {
      cy.button("Back").click();
      cy.findByText("Custom Expression").click();
      H.CustomExpressionEditor.value().should(
        "equal",
        dedent`
          contains(
            [Category],
            "gadget",
            "widget",
            "case-insensitive"
          )
        `.trim(),
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
      cy.button("Update").click();
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
      H.CustomExpressionEditor.value().should(
        "equal",
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
      cy.button("Update").click();
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

describe("issue 49305", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be able to use a custom column in sort for a nested query (metabase#49305)", () => {
    const ccName = "CC Title";

    // This bug does not reproduce if the base question is created via H.createQuestion or H.visitQuestionAdhoc, so create it manually in the UI.
    cy.visit("/");
    H.newButton("Question").click();
    H.entityPickerModalTab("Tables").click();
    H.entityPickerModalItem(2, "Products").click();
    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({
      formula: 'concat("49305 ", [Title])',
      name: ccName,
      allowFastSet: true,
    });
    H.popover().button("Done").click();
    H.saveQuestion(
      "49305 Base question",
      { wrapId: true },
      { tab: "Browse", path: ["Our analytics"], select: true },
    );

    cy.get("@questionId").then((id) => {
      const nestedQuestion = {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": `card__${id}`,
            aggregation: [["count"]],
            breakout: [["field", ccName, { "base-type": "type/Text" }]],
            limit: 2,
          },
          type: "query",
        },
      };

      H.visitQuestionAdhoc(nestedQuestion, { mode: "notebook" });

      // Verify that a sort step can be added via the UI. This is the bug we are validating.
      cy.button("Sort").click();
      H.popover().contains(ccName).click();
      H.getNotebookStep("sort").contains(ccName).click();

      H.verifyNotebookQuery("49305 Base question", [
        {
          aggregations: ["Count"],
          breakouts: [ccName],
          limit: 2,
          sort: [{ column: ccName, order: "desc" }],
        },
      ]);

      H.visualize();
      cy.findByLabelText("Switch to data").click();
      H.assertTableData({
        columns: ["CC Title", "Count"],
        firstRows: [
          ["49305 Synergistic Wool Coat", "1"],
          ["49305 Synergistic Steel Chair", "1"],
        ],
      });
    });
  });
});

describe("issue 50925", () => {
  const questionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Custom: [
          "case",
          [
            [
              [
                "=",
                ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }],
                1,
              ],
              [
                "*",
                ["field", PRODUCTS.PRICE, { "base-type": "type/Float" }],
                1.21,
              ],
            ],
          ],
          {
            default: ["field", PRODUCTS.PRICE, { "base-type": "type/Float" }],
          },
        ],
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not remove existing characters when applying autocomplete suggestion (metabase#50925)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();

    cy.log("incomplete bracket identifier is followed by whitespace");
    H.getNotebookStep("expression").findByText("Custom").click();

    H.CustomExpressionEditor.focus()
      .type("{leftarrow}".repeat(9))
      .type(" [Pr", { focus: false });

    H.CustomExpressionEditor.completions().should("be.visible");
    H.CustomExpressionEditor.get().realPress("Enter", { pressDelay: 10 });

    H.CustomExpressionEditor.blur()
      .value()
      .should("equal", "case([ID] = 1, [Price] * 1.21, [Price] [Price])");

    cy.log("incomplete bracket identifier is followed by bracket identifier");
    H.popover().button("Cancel").click();
    H.getNotebookStep("expression").findByText("Custom").click();

    H.CustomExpressionEditor.focus()
      .type("{leftarrow}".repeat(9))
      .type(" [Pr", { focus: false });

    cy.wait(300);
    H.CustomExpressionEditor.completions().should("be.visible");
    H.CustomExpressionEditor.get().realPress("Enter", { pressDelay: 10 });

    H.CustomExpressionEditor.blur()
      .value()
      .should("equal", "case([ID] = 1, [Price] * 1.21, [Price] [Price])");
  });
});

describe("issue 53682", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show an error message when trying to use a multi-arg expression function with not enough arguments (metabase#53682)", () => {
    H.openProductsTable({ mode: "notebook" });
    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({
      formula: "contains([Category])",
    });
    H.popover().within(() => {
      cy.findByText("Function contains expects at least 2 arguments").should(
        "be.visible",
      );
      cy.button("Done").should("be.disabled");
    });
  });
});

describe("issue 53527", () => {
  const nativeQuestionDetails = {
    name: "Quotes SQL",
    native: {
      query: "SELECT 'a\"b' AS TEXT",
      "template-tags": {},
    },
  };

  const mbqlQuestionDetails = (cardId) => ({
    name: "Quotes MBQL",
    query: {
      "source-table": `card__${cardId}`,
    },
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should properly unescape quotes in the expression editor (metabase#53527)", () => {
    H.createNativeQuestion(nativeQuestionDetails).then(({ body: card }) => {
      H.createQuestion(mbqlQuestionDetails(card.id), { visitQuestion: true });
    });
    H.openNotebook();
    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({
      formula: 'replace([TEXT], "\\"", "")',
      name: "CustomColumn",
    });
    H.popover().button("Done").click();
    H.visualize();
    H.tableInteractive().findByText("ab").should("be.visible");
  });
});

describe("issue 48562", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        CustomColumn: ["contains", ["field", 10000, null], "abc"],
      },
      filter: ["+", 1, ["segment", 10001]],
      aggregation: [["metric", 10002]],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not crash when referenced columns, segments, and metrics do not exist (metabase#48562)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();

    H.getNotebookStep("expression").findByText("CustomColumn").click();
    H.CustomExpressionEditor.value().should("contain", "[Unknown Field]");
    H.expressionEditorWidget().button("Cancel").click();

    H.getNotebookStep("filter").findByText("1 + [Unknown Segment]").click();
    H.CustomExpressionEditor.value().should("contain", "[Unknown Segment]");
    H.expressionEditorWidget().button("Cancel").click();

    H.getNotebookStep("summarize").findByText("[Unknown Metric]").click();
    H.CustomExpressionEditor.value().should("contain", "[Unknown Metric]");
  });
});

describe("issue 54638", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();
  });

  it("should be possible to click documentation links in the expression editor help text popover (metabase#54638)", () => {
    H.CustomExpressionEditor.type("case(");
    H.CustomExpressionEditor.helpText().within(() => {
      cy.findByText("Learn more")
        .scrollIntoView()
        .should("be.visible")
        .then(($a) => {
          expect($a).to.have.attr("target", "_blank");
          // Update attr to open in same tab, since Cypress does not support
          // testing in multiple tabs.
          $a.attr("target", "_self");
        })
        .click();
      cy.url().should(
        "equal",
        "https://www.metabase.com/docs/latest/questions/query-builder/expressions/case.html",
      );
    });
  });
});

describe("issue #54722", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should focus the editor when opening it (metabase#54722)", () => {
    H.addCustomColumn();
    cy.focused().should("have.attr", "role", "textbox");
    H.expressionEditorWidget().button("Cancel").click();

    H.filter({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    cy.focused().should("have.attr", "role", "textbox");
    H.expressionEditorWidget().button("Cancel").click();

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    cy.focused().should("have.attr", "role", "textbox");
    H.expressionEditorWidget().button("Cancel").click();
  });
});

describe("issue #31964", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should focus the editor when opening it (metabase#54722)", () => {
    H.addCustomColumn();
    H.CustomExpressionEditor.type('case([Product -> Category] = "Widget", 1,');
    cy.realPress("Enter");
    H.CustomExpressionEditor.type("[Product -> Categ", { focus: false });
    cy.realPress("Tab");
    H.CustomExpressionEditor.value().should(
      "equal",
      dedent`
        case([Product → Category] = "Widget", 1,
        [Product → Category])
      `,
    );
  });
});

describe("issue #55686", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should show suggestions for functions even when the current token is an operator (metabase#55686)", () => {
    H.addCustomColumn();
    H.CustomExpressionEditor.type("not");

    H.CustomExpressionEditor.completion("notNull").should("be.visible");
    H.CustomExpressionEditor.completion("notEmpty").should("be.visible");
  });
});

describe("issue #55940", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should show the correct example for Offset (metabase#55940)", () => {
    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();

    H.CustomExpressionEditor.type("Offset(");
    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "Offset(Sum([Total]), -1)");
  });
});

describe("issue #55984", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should not overflow the suggestion tooltip when a suggestion name is too long (metabase#55984)", () => {
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: "[Total]",
      name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt",
    });
    cy.button("Done").click();

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.CustomExpressionEditor.type("[lo");
    H.CustomExpressionEditor.completions().should(($el) => {
      expect(H.isScrollableHorizontally($el[0])).to.be.false;
    });
  });

  it("should not overflow the suggestion tooltip when a suggestion name is too long and has no spaces (metabase#55984)", () => {
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: "[Total]",
      name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt".replaceAll(
        " ",
        "_",
      ),
    });
    cy.button("Done").click();

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.CustomExpressionEditor.type("[lo");
    H.CustomExpressionEditor.completions().should(($el) => {
      expect(H.isScrollableHorizontally($el[0])).to.be.false;
    });
  });
});

describe("issue 55622", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to mix regular functions with aggregation functions (metabase#55622)", () => {
    H.openPeopleTable({ mode: "notebook" });
    H.getNotebookStep("data").button("Summarize").click();
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({
      formula: 'datetimeDiff(Max([Created At]), max([Birth Date]), "minute")',
      name: "Aggregation",
    });
    H.popover().button("Done").click();
    H.visualize();
    H.assertQueryBuilderRowCount(1);
  });
});

describe("issue 56152", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("Should show the help text popover when typing a multi-line expression (metabase#56152)", () => {
    H.openPeopleTable({ mode: "notebook" });
    H.addCustomColumn();
    H.CustomExpressionEditor.type(dedent`
      datetimeDiff(
        [Created At],
    `);

    H.CustomExpressionEditor.helpText().should("be.visible");
  });
});

describe("issue 56596", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    const questionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        fields: [["field", PRODUCTS.ID, null]],
        limit: 1,
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.openNotebook();
  });

  it("should not remove backslashes from escaped characters (metabase#56596)", () => {
    H.addCustomColumn();
    const expr = dedent`
      regexExtract([Vendor], "\\s.*")
    `;
    H.enterCustomColumnDetails({
      formula: expr,
      name: "Last name",
    });
    H.CustomExpressionEditor.format();
    H.CustomExpressionEditor.value().should("equal", expr);
    H.expressionEditorWidget().button("Done").click();

    H.getNotebookStep("expression").findByText("Last name").click();
    H.CustomExpressionEditor.value().should("equal", expr);
    H.expressionEditorWidget().button("Cancel").click();

    H.visualize();
    H.assertTableData({
      columns: ["ID", "Last name"],
      firstRows: [["1", " Casper and Hilll"]],
    });
  });
});

describe("issue 55300", () => {
  describe("fields", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsNormalUser();

      const questionDetails = {
        query: {
          "source-table": PRODUCTS_ID,
          fields: [["field", PRODUCTS.ID, null]],
          expressions: {
            now: ["field", PRODUCTS.CREATED_AT, null],
            Count: ["+", 1, 1],
          },
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });
      H.openNotebook();
    });

    it("should be possible to disambiguate between fields and no-argument functions (metabase#55300)", () => {
      H.getNotebookStep("expression").icon("add").click();
      H.CustomExpressionEditor.type("now() > now");

      cy.log("Move cursor over now");
      H.CustomExpressionEditor.type("{leftarrow}");
      H.CustomExpressionEditor.helpTextHeader().should("not.exist");

      cy.log("Move cursor over now()");
      H.CustomExpressionEditor.type("{home}");
      H.CustomExpressionEditor.helpTextHeader().should("contain", "now()");

      H.CustomExpressionEditor.format();
      H.CustomExpressionEditor.value().should("equal", "now() > [now]");
    });

    it("should be possible to disambiguate between fields and no-argument aggregations (metabase#55300)", () => {
      H.summarize({ mode: "notebook" });
      H.popover().findByText("Custom Expression").click();

      H.CustomExpressionEditor.type("Count() + Sum(Count)");

      cy.log("Move cursor over Count");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(2));
      H.CustomExpressionEditor.helpTextHeader().should("contain", "Sum");

      cy.log("Move cursor over Count()");
      H.CustomExpressionEditor.type("{home}");
      H.CustomExpressionEditor.helpTextHeader().should("contain", "Count()");

      H.CustomExpressionEditor.format();
      H.CustomExpressionEditor.value().should(
        "equal",
        "Count() + Sum([Count])",
      );
    });
  });

  describe("segments", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      H.createSegment({
        name: "now",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      H.createSegment({
        name: "Count",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      const questionDetails = {
        query: {
          "source-table": ORDERS_ID,
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });
      H.openNotebook();
    });

    it("should be possible to disambiguate between segments and no-argument functions (metabase#55300)", () => {
      H.addCustomColumn();

      H.CustomExpressionEditor.type("case(now, now(), [Created At])");

      cy.log("Move cursor over now()");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(17));
      H.CustomExpressionEditor.helpTextHeader().should("contain", "now()");

      cy.log("Move cursor over now");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(7), { focus: false });
      H.CustomExpressionEditor.helpTextHeader().should("contain", "case");

      H.CustomExpressionEditor.format();
      H.CustomExpressionEditor.value().should(
        "equal",
        "case([now], now(), [Created At])",
      );
    });

    it("should be possible to disambiguate between segments and no-argument aggregations (metabase#55300)", () => {
      H.summarize({ mode: "notebook" });
      H.popover().findByText("Custom Expression").click();

      H.CustomExpressionEditor.type("Sum(case(Count, Count(), 0))");

      cy.log("Move cursor over now()");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(7));
      H.CustomExpressionEditor.helpTextHeader().should("contain", "Count()");

      cy.log("Move cursor over now");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(18));
      H.CustomExpressionEditor.helpTextHeader().should("contain", "case");

      H.CustomExpressionEditor.format();
      H.CustomExpressionEditor.value().should(
        "equal",
        "Sum(case([Count], Count(), 0))",
      );
    });
  });

  describe("metrics", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      H.createQuestion({
        name: "Count",
        type: "metric",
        description: "A metric",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      });

      const questionDetails = {
        query: {
          "source-table": ORDERS_ID,
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });
      H.openNotebook();
    });

    it("should be possible to disambiguate between metrics and no-argument aggregations (metabase#55300)", () => {
      H.summarize({ mode: "notebook" });
      H.popover().findByText("Custom Expression").click();

      H.CustomExpressionEditor.type("Count + Count()");

      cy.log("Move cursor over Count()");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(5));
      H.CustomExpressionEditor.helpTextHeader().should("contain", "Count()");

      cy.log("Move cursor over Count");
      H.CustomExpressionEditor.type("{home}");
      H.CustomExpressionEditor.helpTextHeader().should("not.exist");

      H.CustomExpressionEditor.format();
      H.CustomExpressionEditor.value().should("equal", "[Count] + Count()");
    });
  });
});

describe("issue 55687", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    const questionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        limit: 1,
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.openNotebook();
  });

  function addExpression(name, expression) {
    H.getNotebookStep("expression").icon("add").click();
    H.enterCustomColumnDetails({
      formula: expression,
      name,
    });
    H.popover().button("Done").click();
  }

  it("should allow passing stringly-typed expressions to is-empty and not-empty (metabase#55687)", () => {
    H.addCustomColumn();
    H.popover().button("Cancel").click();

    addExpression("isEmpty - title", "isEmpty([Title])");
    addExpression("isEmpty - ltrim - title", "isEmpty(lTrim([Title]))");
    addExpression("isEmpty - literal", "isEmpty('AAA')");
    addExpression("isEmpty - ltrim - literal", "isEmpty(lTrim('AAA'))");

    addExpression("notEmpty - title", "notEmpty([Title])");
    addExpression("notEmpty - ltrim - title", "notEmpty(lTrim([Title]))");
    addExpression("notEmpty - literal", "notEmpty('AAA')");
    addExpression("notEmpty - ltrim - literal", "notEmpty(lTrim('AAA'))");

    H.visualize();

    cy.findByTestId("query-visualization-root")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });
});

// TODO: re-enable this test when we have a fix for metabase/metabase#58371
describe.skip("issue 58371", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      display_name: null,
    });

    const baseQuestion = {
      name: "Base Question",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [
          [
            "aggregation-options",
            ["count-where", ["=", ["field", PRODUCTS.TITLE, null], "OK"]],
            { "display-name": "Aggregation with Dash-in-name" },
          ],
        ],
        breakout: [["field", PRODUCTS.ID, null]],
      },
    };

    H.createQuestion(baseQuestion, { wrapId: true }).then((questionId) => {
      const questionDetails = {
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              "source-table": `card__${questionId}`,
              alias: "Other Question",
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Other Question" }],
              ],
            },
          ],
          expressions: {
            Foo: [
              "+",
              0,
              [
                "field",
                "Aggregation with Dash-in-name",
                {
                  "base-type": "type/Float",
                  "join-alias": "Other Question",
                },
              ],
            ],
          },
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });
    });

    H.openNotebook();
  });

  it("should allow using names with a dash in them from joined tables (metabase#58371)", () => {
    H.getNotebookStep("expression").findByText("Foo").click();
    H.CustomExpressionEditor.value().should(
      "eq",
      "0 + [Other Question → Aggregation with Dash-in-name]",
    );
  });
});

describe("Issue 58230", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should display an error when using an aggregation function in a custom column (metabase#58230)", () => {
    H.getNotebookStep("data").button("Custom column").click();
    H.CustomExpressionEditor.type("Average([Total])");
    H.popover().findByText(
      "Aggregations like Average are not allowed when building a custom expression",
    );
  });

  it("should display an error when using an aggregation function in a custom filter (metabase#58230)", () => {
    H.filter({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.CustomExpressionEditor.type("Average([Total])");
    H.popover().findByText(
      "Aggregations like Average are not allowed when building a custom filter",
    );
  });

  it("should not display an error when using an aggregation function in a custom aggregation (metabase#58230)", () => {
    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.CustomExpressionEditor.type("Average([Total])");
    H.CustomExpressionEditor.nameInput().type("Foo");
    H.popover().button("Done").should("be.enabled");
  });
});

describe("issue 57674", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  // TODO: re-enable this test once we have a fix for metabase#61264
  it.skip("should show an error when using a case or if expression with mismatched types (metabase#57674)", () => {
    H.getNotebookStep("data").button("Custom column").click();

    H.CustomExpressionEditor.clear();
    H.popover().findByText("Types are incompatible.").should("not.exist");

    H.CustomExpressionEditor.type('case([Total] > 100, [Created At], "foo")', {
      allowFastSet: true,
    }).blur();

    H.popover().findByText("Types are incompatible.").should("be.visible");
  });

  it("should not show an error when using a case or if expression with compatible types (metabase#57674)", () => {
    H.getNotebookStep("data").button("Custom column").click();

    H.CustomExpressionEditor.clear();
    H.popover().findByText("Types are incompatible.").should("not.exist");

    H.CustomExpressionEditor.type('case([Total] > 100, "foo", "bar")', {
      allowFastSet: true,
    }).blur();

    H.popover().findByText("Types are incompatible.").should("not.exist");
  });
});

describe("Issue 12938", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openProductsTable({ mode: "notebook" });
  });

  it("should be possible to concat number with string (metabase#12938)", () => {
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: "concat(floor([Rating]), [Title])",
      name: "MyCustom",
      clickDone: true,
    });

    H.visualize();
    cy.get("main")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });

  it("should be possible to concat number with string (metabase#12938)", () => {
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: 'concat(hour([Created At]), ":", minute([Created At]))',
      name: "MyCustom",
      clickDone: true,
    });

    H.visualize();
    cy.get("main")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });
});

describe("Issue 25189", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to use a custom column that just references a single column in filters in follow up question (metabase#25189)", () => {
    H.createQuestion({
      name: "Question with CCreated At",
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          "CCreated At": [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
            },
          ],
        },
      },
    }).then((res) => {
      H.createQuestion(
        {
          query: {
            "source-table": `card__${res.body.id}`,
          },
        },
        { visitQuestion: true },
      );
    });
    cy.findAllByTestId("header-cell")
      .contains("CCreated At")
      .should("be.visible");

    H.filter();
    H.popover().within(() => {
      cy.findAllByText("CCreated At").should("have.length", 1).first().click();
      cy.findByText("Today").click();
    });

    cy.findAllByTestId("header-cell")
      .contains("CCreated At")
      .should("be.visible");

    cy.get("main")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });

  it("should be possible to use a custom column that just references a single column in filters in follow up question, when the custom column has the same name as the column (metabase#25189)", () => {
    H.createQuestion({
      name: "Question with Created At",
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          "Created At": [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
            },
          ],
        },
      },
    }).then((res) => {
      H.createQuestion(
        {
          query: {
            "source-table": `card__${res.body.id}`,
          },
        },
        { visitQuestion: true },
      );
    });
    cy.findAllByTestId("header-cell")
      .contains("Created At")
      .should("be.visible");

    H.filter();
    H.popover().within(() => {
      cy.findAllByText("Created At").should("have.length", 2).first().click();
      cy.findByText("Today").click();
    });

    H.filter();
    H.popover().within(() => {
      cy.findAllByText("Created At").should("have.length", 2).last().click();
      cy.findByText("Today").click();
    });

    cy.findAllByTestId("header-cell")
      .contains("Created At")
      .should("be.visible");

    cy.get("main")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });
});

describe("Issue 26512", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.openOrdersTable({ mode: "notebook" });
  });

  const TEST_CASES = [
    'year("a string")',
    'month("a string")',
    'day("a string")',
    'hour("a string")',
    'minute("a string")',
    'datetimeAdd("a string", 1, "day")',
    'datetimeDiff("a string", 1, "day")',
    "year(1)",
    "month(42)",
    "day(102)",
    "hour(140)",
    "minute(55)",
    'datetimeAdd(42, 1, "day")',
    'datetimeDiff(42, 1, "day")',
    "year(true)",
    "month(true)",
    "day(true)",
    "hour(true)",
    "minute(true)",
    'datetimeAdd(true, 1, "day")',
    'datetimeDiff(true, 1, "day")',
  ];

  it("should validate types for date/time functions (metabase#26512)", () => {
    H.addCustomColumn();

    TEST_CASES.forEach((formula) => {
      H.CustomExpressionEditor.clear()
        .type(formula, { allowFastSet: true })
        .blur();
      H.popover().findByText("Types are incompatible.").should("be.visible");
    });
  });
});

describe("Issue 38498", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();

    H.startNewQuestion();
    H.entityPickerModal().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
    });
  });

  it("should not be possible to use convertTimezone with an invalid timezone (metabse#38498)", () => {
    H.addCustomColumn();
    H.CustomExpressionEditor.type(
      'convertTimezone([Created At], "Asia/Ho_Chi_Mihn", "UTC")',
    );
    H.popover().findByText("Types are incompatible.").should("be.visible");
  });
});

describe("Issue 61010", () => {
  const CUSTOM_COLUMN_NAME = "Foo";
  const AGGREGATION_NAME = "New count";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            [CUSTOM_COLUMN_NAME]: ["+", 1, 2],
          },
          aggregation: [
            [
              "aggregation-options",
              ["+", ["count"], 1],
              {
                name: AGGREGATION_NAME,
                "display-name": AGGREGATION_NAME,
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );

    H.openNotebook();
  });

  it("should not be possible to reference a custom expression in itself (metabase#61010)", () => {
    H.getNotebookStep("expression").findByText(CUSTOM_COLUMN_NAME).click();
    H.CustomExpressionEditor.clear().type("[Fo");
    H.CustomExpressionEditor.completions()
      .findByText("Foo")
      .should("not.exist");

    H.CustomExpressionEditor.clear().type("[Foo]");
    H.popover().findByText("Unknown column: Foo").should("be.visible");
  });

  it("should not be possible to reference an aggregation in itself(metabase#61010)", () => {
    H.getNotebookStep("summarize").findByText(AGGREGATION_NAME).click();
    H.CustomExpressionEditor.clear().type("[New cou");
    H.CustomExpressionEditor.completions()
      .findByText("New count")
      .should("not.exist");

    H.CustomExpressionEditor.clear().type("[New count]");
    H.popover()
      .findByText("Unknown Aggregation or Metric: New count")
      .should("be.visible");
  });
});
