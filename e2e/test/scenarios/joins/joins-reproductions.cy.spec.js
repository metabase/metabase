import { H } from "e2e/support";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

describe("issue 12928", () => {
  const SOURCE_QUESTION_NAME = "12928_Q1";
  const JOINED_QUESTION_NAME = "12928_Q2";

  const SOURCE_QUESTION_DETAILS = {
    name: SOURCE_QUESTION_NAME,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
        ["field", PEOPLE.SOURCE, { "join-alias": "People - User" }],
      ],
      joins: [
        {
          alias: "Products",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          fields: "all",
          "source-table": PRODUCTS_ID,
        },
        {
          alias: "People - User",
          condition: [
            "=",
            ["field", ORDERS.USER_ID, null],
            ["field", PEOPLE.ID, { "join-alias": "People - User" }],
          ],
          fields: "all",
          "source-table": PEOPLE_ID,
        },
      ],
    },
  };

  const JOINED_QUESTION_DETAILS = {
    name: JOINED_QUESTION_NAME,
    query: {
      "source-table": REVIEWS_ID,
      aggregation: [["avg", ["field", REVIEWS.RATING, null]]],
      breakout: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
      joins: [
        {
          alias: "Products",
          condition: [
            "=",
            ["field", REVIEWS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          fields: "all",
          "source-table": PRODUCTS_ID,
        },
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should join saved questions that themselves contain joins (metabase#12928)", () => {
    cy.createQuestion(SOURCE_QUESTION_DETAILS);
    cy.createQuestion(JOINED_QUESTION_DETAILS, {
      wrapId: true,
      idAlias: "joinedQuestionId",
    });

    H.startNewQuestion();
    H.selectSavedQuestionsToJoin(SOURCE_QUESTION_NAME, JOINED_QUESTION_NAME);
    H.popover().findByText("Products → Category").click();
    H.popover().findByText("Products → Category").click();

    H.visualize();

    cy.get("@joinedQuestionId").then(joinedQuestionId => {
      H.assertJoinValid({
        lhsTable: SOURCE_QUESTION_NAME,
        rhsTable: JOINED_QUESTION_NAME,
        lhsSampleColumn: "Products → Category",
        rhsSampleColumn: `${JOINED_QUESTION_NAME} - Products → Category → Category`,
      });
    });

    H.assertQueryBuilderRowCount(20);
  });
});

describe("issue 14793", () => {
  const XRAY_DATASETS = 11; // enough to load most questions

  const QUESTION_DETAILS = {
    dataset_query: {
      type: "query",
      query: {
        "source-table": REVIEWS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", REVIEWS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        aggregation: [
          ["sum", ["field", PRODUCTS.PRICE, { "join-alias": "Products" }]],
        ],
        breakout: [["field", REVIEWS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      database: SAMPLE_DB_ID,
    },
    display: "line",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/automagic-dashboards/adhoc/**").as("xray");
    cy.intercept("POST", "/api/dataset").as("postDataset");
  });

  it("x-rays should work on explicit joins when metric is for the joined table (metabase#14793)", () => {
    H.visitQuestionAdhoc(QUESTION_DETAILS);

    H.cartesianChartCircle().eq(2).click({ force: true });

    H.popover().findByText("Automatic insights…").click();
    H.popover().findByText("X-ray").click();

    cy.wait("@xray").then(xhr => {
      for (let i = 0; i < XRAY_DATASETS; ++i) {
        cy.wait("@postDataset");
      }
      expect(xhr.status).not.to.eq(500);
      expect(xhr.response.body.cause).not.to.exist;
    });

    H.dashboardGrid()
      .findByText("How this metric is distributed across different numbers")
      .should("exist");

    cy.findByTestId("automatic-dashboard-header")
      .findByText(/^A closer look at/)
      .should("be.visible");

    H.getDashboardCards().should("have.length", 18);
  });
});

describe("issue 15342", { tags: "@external" }, () => {
  const MYSQL_DB_NAME = "QA MySQL8";

  beforeEach(() => {
    H.restore("mysql-8");
    cy.signInAsAdmin();

    cy.viewport(4000, 1200); // huge width required so three joined tables can fit
  });

  it("should correctly order joins for MySQL queries (metabase#15342)", () => {
    H.startNewQuestion();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText(MYSQL_DB_NAME).click();
      cy.findByText("People").click();
    });

    cy.icon("join_left_outer").click();
    H.entityPickerModal().findByText("Orders").click();
    H.getNotebookStep("join").findByLabelText("Right column").click();
    H.popover().findByText("Product ID").click();

    cy.icon("join_left_outer").last().click();
    H.entityPickerModal().findByText("Products").click();
    H.getNotebookStep("join").icon("join_left_outer").click();
    H.popover().findByText("Inner join").click();

    H.visualize();

    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("Email"); // from People table
      cy.findByText("Orders → ID"); // joined Orders table columns
      cy.findByText("Products → ID"); // joined Products table columns
    });
  });
});

describe("issue 15578", () => {
  const JOINED_QUESTION_NAME = "15578";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");

    // Remap display value
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    cy.createQuestion({
      name: JOINED_QUESTION_NAME,
      query: { "source-table": ORDERS_ID },
    });
  });

  it("joining on a question with remapped values should work (metabase#15578)", () => {
    H.openProductsTable({ mode: "notebook" });

    cy.button("Join data").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Saved questions").click();
      cy.findByText(JOINED_QUESTION_NAME).click();
    });

    H.visualize();

    H.queryBuilderHeader()
      .findByTestId("question-table-badges")
      .within(() => {
        cy.findByText("Products").should("be.visible");
        cy.findByText(JOINED_QUESTION_NAME).should("be.visible");
      });

    H.queryBuilderMain().within(() => {
      cy.findByText("Category").should("be.visible");
      cy.findByText(`${JOINED_QUESTION_NAME} → ID`).should("be.visible");
    });
  });
});

describe("issue 17710", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.restore();
    cy.signInAsAdmin();
  });

  it("should remove only invalid join clauses (metabase#17710)", () => {
    H.openOrdersTable({ mode: "notebook" });

    cy.button("Join data").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });

    H.getNotebookStep("join").icon("add").click();

    // Close the LHS column popover that opens automatically
    H.getNotebookStep("join").parent().click();

    H.visualize();

    H.openNotebook();

    cy.findByTestId("step-join-0-0").within(() => {
      cy.findByText("ID");
      cy.findByText("Product ID");
    });
  });
});

describe("issue 17767", () => {
  const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

  const questionDetails = {
    name: "17767",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }]],
      limit: 2,
    },
  };

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();
  });

  it("should be able to do subsequent joins on question with the aggregation that uses implicit joins (metabase#17767)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    H.openNotebook();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();

    // Join "Previous results" with
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Reviews").click();
    });

    H.visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("xavier");
  });
});

describe("issue 17968", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show 'Previous results' instead of a table name for non-field dimensions (metabase#17968)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Count of rows").click();

    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().findByText("Created At").click();

    cy.findAllByTestId("action-buttons").last().button("Join data").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });
    H.popover().findByText("Count").click();

    H.getNotebookStep("join", { stage: 1 })
      .findByLabelText("Left column")
      .findByText("Previous results");
  });
});

describe("issue 18502", () => {
  const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

  const question1 = getQuestionDetails("18502#1", PEOPLE.CREATED_AT);
  const question2 = getQuestionDetails("18502#2", PEOPLE.BIRTH_DATE);

  function getQuestionDetails(name, breakoutColumn) {
    return {
      name,
      query: {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [["field", breakoutColumn, { "temporal-unit": "month" }]],
      },
    };
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be able to join two saved questions based on the same table (metabase#18502)", () => {
    cy.intercept("GET", "/api/collection/*/items?*").as("getCollectionContent");

    cy.createQuestion(question1);
    cy.createQuestion(question2);

    H.startNewQuestion();
    H.selectSavedQuestionsToJoin("18502#1", "18502#2");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At: Month").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Birth Date: Month").click();

    H.visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("April 2022");
  });
});

describe("issue 18512", () => {
  function getQuestionDetails(name, catFilter) {
    return {
      name,
      query: {
        "source-table": REVIEWS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", REVIEWS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        filter: [
          "=",
          ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
          catFilter,
        ],
        aggregation: [
          ["distinct", ["field", PRODUCTS.ID, { "join-alias": "Products" }]],
        ],
        breakout: [
          [
            "field",
            PRODUCTS.CREATED_AT,
            { "join-alias": "Products", "temporal-unit": "month" },
          ],
        ],
      },
    };
  }

  const question1 = getQuestionDetails("18512#1", "Doohickey");
  const question2 = getQuestionDetails("18512#2", "Gizmo");

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();
  });

  it("should join two saved questions with the same implicit/explicit grouped field (metabase#18512)", () => {
    cy.createQuestion(question1);
    cy.createQuestion(question2);

    H.startNewQuestion();
    H.selectSavedQuestionsToJoin("18512#1", "18512#2");

    H.popover().findByText("Products → Created At: Month").click();
    H.popover().findByText("Products → Created At: Month").click();

    H.visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Products → Created At: Month");
  });
});

describe("issue 18589", () => {
  function joinTable(table) {
    cy.findByText("Join data").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText(table).click();
    });
  }

  function selectFromDropdown(option, clickOpts) {
    H.popover().findByText(option).click(clickOpts);
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should not bin numeric fields in join condition by default (metabase#18589)", () => {
    H.openOrdersTable({ mode: "notebook" });

    joinTable("Reviews");
    selectFromDropdown("Quantity");
    selectFromDropdown("Rating");

    H.summarize({ mode: "notebook" });
    selectFromDropdown("Count of rows");

    H.visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2,860,368");
  });
});

describe("issue 18630", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  const QUERY_WITH_FIELD_CLAUSE = {
    "source-query": {
      "source-table": ORDERS_ID,
      joins: [
        {
          fields: "all",
          "source-table": PEOPLE_ID,
          condition: [
            "=",
            ["field", ORDERS.USER_ID, null],
            ["field", PEOPLE.ID, { "join-alias": "People - User" }],
          ],
          alias: "People - User",
        },
      ],
      expressions: {
        coalesce: [
          "coalesce",
          ["field", ORDERS.USER_ID, null],
          ["field", PEOPLE.ID, { "join-alias": "People - User" }],
        ],
      },
      aggregation: [["count"]],
      breakout: [["expression", "coalesce"]],
    },
    joins: [
      {
        fields: "all",
        "source-table": PEOPLE_ID,
        condition: [
          "=",
          ["field", "coalesce", { "base-type": "type/Float" }],
          ["field", PEOPLE.ID, { "join-alias": "People" }],
        ],
        alias: "People",
      },
    ],
    limit: 3,
  };

  const questionDetails = {
    name: "18630",
    query: QUERY_WITH_FIELD_CLAUSE,
  };

  it("should normally open queries with field literals in joins (metabase#18630)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    // The query runs and we assert the page is not blank,
    // which was caused by an infinite loop and a stack overflow.
    cy.findByDisplayValue(questionDetails.name);
    cy.get("[data-testid=cell-data]").contains("29494 Anderson Drive");
    cy.findByTestId("question-row-count").should("have.text", "Showing 3 rows");
  });
});

describe("issue 18818", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.restore();
    cy.signInAsAdmin();
  });

  it("should normally open notebook editor for queries joining on custom columns (metabase#18818)", () => {
    cy.createQuestion(
      {
        query: {
          "source-table": REVIEWS_ID,
          expressions: {
            "CC Rating": ["field", REVIEWS.RATING],
          },
          joins: [
            {
              fields: "all",
              "source-table": ORDERS_ID,
              condition: [
                "=",
                ["expression", "CC Rating"],
                ["field", ORDERS.QUANTITY, { "join-alias": "Orders" }],
              ],
            },
          ],
        },
      },
      { visitQuestion: true },
    );

    H.openNotebook();
    cy.findAllByText("CC Rating");
  });
});

describe("issue 20519", () => {
  const questionDetails = {
    name: "20519",
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
      joins: [
        {
          fields: "all",
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field", "CATEGORY", { "base-type": "type/Text" }],
            ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
      limit: 2,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();
  });

  // Tightly related issue: metabase#17767
  it("should allow subsequent joins and nested query after summarizing on the implicit joins (metabase#20519)", () => {
    cy.findAllByLabelText("Custom column").last().click();

    H.enterCustomColumnDetails({
      formula: "1 + 1",
      name: "Two",
    });

    cy.button("Done").click();

    H.getNotebookStep("expression", { stage: 1 })
      .contains("Two")
      .should("exist");

    H.visualize(response => {
      expect(response.body.error).not.to.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Doohickey");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Two");
  });
});

describe("issue 22859 - multiple levels of nesting", () => {
  const questionDetails = {
    name: "22859-Q1",
    query: {
      "source-table": REVIEWS_ID,
      joins: [
        {
          fields: "all",
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field", REVIEWS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
    },
  };

  function getJoinedTableColumnHeader() {
    cy.get("@q1Id").then(id => {
      cy.findByText(`Question ${id} → ID`);
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { wrapId: true, idAlias: "q1Id" });

    // Join Orders table with the previously saved question and save it again
    cy.get("@q1Id").then(id => {
      const nestedQuestionDetails = {
        name: "22859-Q2",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              alias: `Question ${id}`,
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
                [
                  "field",
                  REVIEWS.PRODUCT_ID,
                  {
                    "base-type": "type/Integer",
                    "join-alias": `Question ${id}`,
                  },
                ],
              ],
              "source-table": `card__${id}`,
            },
          ],
          limit: 5,
        },
      };

      cy.createQuestion(nestedQuestionDetails, {
        wrapId: true,
        idAlias: "q2Id",
      });
    });
  });

  it("model based on multi-level nested saved question should work (metabase#22859-1)", () => {
    cy.get("@q2Id").then(id => {
      // Convert the second question to a model
      cy.request("PUT", `/api/card/${id}`, { type: "model" });

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.visit(`/model/${id}`);
      cy.wait("@dataset");
    });

    getJoinedTableColumnHeader();
  });

  it("third level of nesting with joins should result in proper column aliasing (metabase#22859-2)", () => {
    H.startNewQuestion();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Saved questions").click();
      cy.findByText("22859-Q2").click();
    });

    H.visualize();

    getJoinedTableColumnHeader();
  });
});

describe("issue 23293", () => {
  /**
   * @param {string} columnName
   * @param {("add"|"remove")} action
   */
  function modifyColumn(columnName, action) {
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByRole("button", { name: "Add or remove columns" }).click();
      if (action === "add") {
        cy.findByLabelText(columnName).should("not.be.checked").click();
      } else {
        cy.findByLabelText(columnName).should("be.checked").click();
      }

      cy.findByRole("button", { name: "Done picking columns" }).click();
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  it("should retain the filter when drilling through the dashboard card with implicitly added column (metabase#23293)", () => {
    H.openOrdersTable();

    cy.findByTestId("viz-settings-button").click();
    modifyColumn("Product ID", "remove");
    modifyColumn("Category", "add");
    cy.wait("@dataset");

    H.queryBuilderHeader().button("Save").click();
    cy.findByTestId("save-question-modal")
      .findByLabelText(/Where do you want to save this/)
      .click();
    H.pickEntity({
      tab: "Browse",
      path: ["Our analytics"],
    });
    H.entityPickerModal().findByText("Select this collection").click();
    cy.findByTestId("save-question-modal").button("Save").click();

    cy.wait("@saveQuestion").then(({ response }) => {
      cy.button("Not now").click();

      const id = response.body.id;
      const questionDetails = {
        query: {
          "source-table": `card__${id}`,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              PRODUCTS.CATEGORY,
              {
                "source-field": ORDERS.PRODUCT_ID,
              },
            ],
          ],
        },
        display: "bar",
      };

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id } }) => {
          H.visitDashboard(dashboard_id);
        },
      );

      // Click on the first bar
      H.chartPathWithFillColor("#509EE3").first().realClick();
      H.popover()
        .findByText(/^See these/)
        .click();

      cy.findByTestId("qb-filters-panel").should(
        "contain",
        "Product → Category is Doohickey",
      );
      cy.findAllByTestId("header-cell")
        .last()
        .should("have.text", "Product → Category");

      cy.findAllByRole("grid")
        .last()
        .as("tableResults")
        .should("contain", "Doohickey")
        .and("not.contain", "Gizmo");
    });
  });
});

describe("issue 27380", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();
  });

  it("should not drop fields from joined table on dashboard 'zoom-in' (metabase#27380)", () => {
    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PRODUCTS.CREATED_AT,
            { "source-field": ORDERS.PRODUCT_ID, "temporal-unit": "month" },
          ],
        ],
      },
      display: "line",
    };
    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      },
    );

    // Doesn't really matter which 'circle" we click on the graph
    H.cartesianChartCircle().last().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See this month by week").click();
    cy.wait("@dataset");

    // Graph should still exist
    // Checks the y-axis label
    H.echartsContainer().findByText("Count");

    H.openNotebook();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product → Created At: Week");
  });
});

describe("issue 27873", () => {
  const questionDetails = {
    dataset_query: {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PEOPLE_ID,
            condition: [
              "=",
              ["field", ORDERS.USER_ID, null],
              ["field", PEOPLE.ID, { "join-alias": "People - User" }],
            ],
            alias: "People - User",
          },
        ],
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.TOTAL, { binning: { strategy: "default" } }],
          ["field", PEOPLE.SOURCE, { "join-alias": "People - User" }],
        ],
      },
      database: SAMPLE_DB_ID,
    },
    display: "table",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show a group by column from the joined field in the summarize sidebar (metabase#27873)", () => {
    H.visitQuestionAdhoc(questionDetails);
    H.summarize();

    cy.findByTestId("aggregation-item").should("have.text", "Count");
    cy.findByTestId("pinned-dimensions")
      .should("contain", "Total")
      .and("contain", "People - User → Source");
  });
});

describe("issue 29795", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow join based on native query (metabase#29795)", () => {
    const NATIVE_QUESTION = "native question";
    const LIMIT = 5;
    cy.createNativeQuestion(
      {
        name: NATIVE_QUESTION,
        native: { query: `SELECT * FROM "PUBLIC"."ORDERS" LIMIT ${LIMIT}` },
      },
      { loadMetadata: true },
    );

    H.openOrdersTable({ mode: "notebook", limit: LIMIT });

    cy.icon("join_left_outer").click();

    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Saved questions").click();
      cy.findByText(NATIVE_QUESTION).click();
    });

    H.popover().within(() => {
      cy.findByRole("option", { name: "ID" }).click();
    });

    H.popover().within(() => {
      cy.findByRole("option", { name: "USER_ID" }).click();
    });

    H.visualize(() => {
      cy.findAllByText(/User ID/i).should("have.length", 2);
    });
  });
});

describe("issue 30743", () => {
  const query = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
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
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.visitQuestionAdhoc(query, { mode: "notebook" });
  });

  it("should be possible to sort on the breakout column (metabase#30743)", () => {
    cy.findByLabelText("Sort").click();
    H.popover().contains("Category").click();

    H.visualize();
    // Check bars count
    H.chartPathWithFillColor("#509EE3").should("have.length", 4);
  });
});

describe("issue 31769", () => {
  const Q1 = {
    "source-table": ORDERS_ID,
    joins: [
      {
        fields: "all",
        alias: "Products",
        "source-table": PRODUCTS_ID,
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
      },
      {
        fields: "all",
        alias: "People — User",
        "source-table": PEOPLE_ID,
        condition: [
          "=",
          ["field", ORDERS.USER_ID, null],
          ["field", PEOPLE.ID, { "join-alias": "People — User" }],
        ],
      },
    ],
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text", "join-alias": "Products" },
      ],
    ],
  };

  const Q2 = {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.createQuestion({ name: "Q1", query: Q1 }).then(() => {
      cy.createQuestion({ name: "Q2", query: Q2 }).then(response => {
        cy.wrap(response.body.id).as("card_id_q2");
        H.startNewQuestion();
      });
    });
  });

  it("shouldn't drop joins using MLv2 format (metabase#31769)", () => {
    H.selectSavedQuestionsToJoin("Q1", "Q2");

    H.popover().findByText("Products → Category").click();
    H.popover().findByText("Category").click();

    H.visualize();

    // Asserting there're two columns from Q1 and two columns from Q2
    cy.findAllByTestId("header-cell").should("have.length", 4);

    cy.get("@card_id_q2").then(cardId => {
      cy.findByTestId("TableInteractive-root")
        .findByText("Q2 - Products → Category → Category")
        .should("exist");
    });

    cy.findByTestId("TableInteractive-root")
      .findByText("Products → Category")
      .should("exist");
  });
});

describe("issue 39448", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should load joined table metadata for suggested join conditions (metabase#39448)", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByTestId("action-buttons").button("Join data").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });
    H.getNotebookStep("join").within(() => {
      cy.findByLabelText("Right table").should("have.text", "Products");
      cy.findByLabelText("Left column")
        .findByText("Product ID")
        .should("be.visible");
      cy.findByLabelText("Right column").findByText("ID").should("be.visible");
      cy.findByLabelText("Change operator").should("have.text", "=");
    });
  });
});

// See TODO inside this test when unskipping
describe.skip("issue 27521", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("correctly displays joined question's column names (metabase#27521)", () => {
    cy.visit("/");

    cy.log("Create Q1");
    H.openOrdersTable({ mode: "notebook" });

    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("Select none").click();

    H.join();

    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });

    H.popover().findByText("ID").click();
    H.popover().findByText("ID").click();

    H.getNotebookStep("join", { stage: 0, index: 0 })
      .button("Pick columns")
      .click();
    H.popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByText("ID").click();
    });

    H.visualize();
    assertTableHeader(0, "ID");
    assertTableHeader(1, "Orders → ID");

    H.saveQuestion("Q1");

    assertTableHeader(0, "ID");
    assertTableHeader(1, "Orders → ID");

    cy.log("Create second question (Products + Q1)");
    H.newButton("Question").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("People").click();
    });

    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("Select none").click();

    H.join();

    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Saved questions").click();
      cy.findByText("Q1").click();
    });

    H.popover().findByText("ID").click();
    H.popover().findByText("Orders → ID").should("be.visible").click();
    H.getNotebookStep("join")
      .findByLabelText("Right column")
      .findByText("Orders → ID")
      .should("be.visible")
      .click();
    H.popover().findByText("ID").should("be.visible").click();

    H.visualize();

    assertTableHeader(0, "ID");
    assertTableHeader(1, "Q1 → ID");
    assertTableHeader(2, "Q1 → Orders → ID");

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findAllByText("ID").should("have.length", 1);
      cy.findAllByText("Q1 → ID").should("have.length", 1);
      cy.findAllByText("Q1 → Orders → ID").should("have.length", 1);

      cy.findByRole("button", { name: "Add or remove columns" }).click();
      cy.findAllByText("ID").should("have.length", 2);
      cy.findAllByText("Orders → ID").should("have.length", 1);

      // TODO: add assertions for what happens when toggling all the columns here
      // See https://github.com/metabase/metabase/issues/27521#issuecomment-1948658757
    });
  });

  function assertTableHeader(index, name) {
    cy.findAllByTestId("header-cell").eq(index).should("have.text", name);
  }
});

describe("issue 42385", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should remove invalid draft join clause when query database changes (metabase#42385)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.join();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Reviews").click();
    });

    H.getNotebookStep("data").findByTestId("data-step-cell").click();
    H.entityPickerModal().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("Reviews").click();
    });

    H.getNotebookStep("join").within(() => {
      cy.findByLabelText("Right table")
        .findByText("Pick data…")
        .should("be.visible");
      cy.findByLabelText("Left column").should("not.exist");
      cy.findByLabelText("Right column").should("not.exist");
    });
  });

  it("should remove invalid join clause in incomplete draft state when query database changes (metabase#42385)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.join();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });

    H.getNotebookStep("join")
      .findByLabelText("Right table")
      .findByText("Products")
      .click();

    H.entityPickerModal().findByText("Reviews").click();

    H.getNotebookStep("data").findByTestId("data-step-cell").click();
    H.entityPickerModal().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("Reviews").click();
    });

    H.getNotebookStep("join").should("not.exist");
  });
});

describe("issue 45300", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("joins using the foreign key only should not break the filter modal (metabase#45300)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": REVIEWS_ID,
          joins: [
            {
              fields: "all",
              strategy: "left-join",
              alias: "Orders - Product",
              condition: [
                "=",
                ["field", REVIEWS.PRODUCT_ID, { "base-type": "type/Integer" }],
                [
                  "field",
                  ORDERS.PRODUCT_ID,
                  {
                    "base-type": "type/Integer",
                    "join-alias": "Orders - Product",
                  },
                ],
              ],
              "source-table": ORDERS_ID,
            },
          ],
        },
        parameters: [],
      },
    });

    H.filter();

    H.modal().within(() => {
      // sidebar
      cy.findByRole("tablist").within(() => {
        cy.findAllByRole("tab", { name: "Product" }).eq(0).click();
      });

      // main panel
      cy.findAllByTestId("filter-column-Category")
        .should("have.length", 1)
        .within(() => {
          cy.findByText("Doohickey").click();
        });

      cy.button("Apply filters").click();
      cy.wait("@dataset");
    });

    cy.findByTestId("filter-pill").should(
      "have.text",
      "Product → Category is Doohickey",
    );
  });
});

describe("issue 46675", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    cy.log("create draft state with a rhs table and a lhs column");
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();
    H.getNotebookStep("data").findByLabelText("Join data").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Reviews").click();
    });
    H.popover().findByText("ID").click();
  });

  it("should reset the draft join state when the source table changes (metabase#46675)", () => {
    cy.log("change the source table and verify that the state was reset");
    H.getNotebookStep("data").findByText("Orders").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });
    H.getNotebookStep("join").within(() => {
      cy.findByLabelText("Left table").should("have.text", "Products");
      cy.findByLabelText("Right table").should("have.text", "Pick data…");
      cy.findByLabelText("Left column").should("not.exist");
    });

    cy.log("complete the join and make sure the query can be executed");
    H.getNotebookStep("join")
      .findByLabelText("Right table")
      .findByText("Pick data…")
      .click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });
    H.visualize();
    H.tableInteractive().should("be.visible");
  });

  it("should reset the draft join state when the source table changes (metabase#46675)", () => {
    cy.log("change the rhs table and verify that the state was reset");
    H.getNotebookStep("join")
      .findByLabelText("Right table")
      .findByText("Reviews")
      .click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });
    H.getNotebookStep("join").within(() => {
      cy.findByLabelText("Left table").should("have.text", "Orders");
      cy.findByLabelText("Right table").should("have.text", "Orders");
      cy.findByLabelText("Left column").should(
        "contain.text",
        "Pick a column…",
      );
    });

    cy.log("complete the join and make sure the query can be executed");
    H.popover().findByText("ID").click();
    H.popover().findByText("ID").click();
    H.visualize();
    H.tableInteractive().should("be.visible");
  });
});
