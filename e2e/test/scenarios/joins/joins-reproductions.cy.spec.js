import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertJoinValid,
  assertQueryBuilderRowCount,
  popover,
  restore,
  selectSavedQuestionsToJoin,
  startNewQuestion,
  visualize,
  visitQuestionAdhoc,
  cartesianChartCircle,
  dashboardGrid,
  getDashboardCards,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  queryBuilderHeader,
  openProductsTable,
  queryBuilderMain,
  openOrdersTable,
  summarize,
  enterCustomColumnDetails,
  visitDashboard,
  chartPathWithFillColor,
  echartsContainer,
  join,
  newButton,
  saveQuestion,
  modal,
  filter,
  openNotebook,
} from "e2e/support/helpers";

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
    restore();
    cy.signInAsAdmin();
  });

  it("should join saved questions that themselves contain joins (metabase#12928)", () => {
    cy.createQuestion(SOURCE_QUESTION_DETAILS);
    cy.createQuestion(JOINED_QUESTION_DETAILS, {
      wrapId: true,
      idAlias: "joinedQuestionId",
    });

    startNewQuestion();
    selectSavedQuestionsToJoin(SOURCE_QUESTION_NAME, JOINED_QUESTION_NAME);
    popover().findByText("Products → Category").click();
    popover().findByText("Products → Category").click();

    visualize();

    cy.get("@joinedQuestionId").then(joinedQuestionId => {
      assertJoinValid({
        lhsTable: SOURCE_QUESTION_NAME,
        rhsTable: JOINED_QUESTION_NAME,
        lhsSampleColumn: "Products → Category",
        rhsSampleColumn: `${JOINED_QUESTION_NAME} - Products → Category → Category`,
      });
    });

    assertQueryBuilderRowCount(20);
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
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/automagic-dashboards/adhoc/**").as("xray");
    cy.intercept("POST", "/api/dataset").as("postDataset");
  });

  it("x-rays should work on explicit joins when metric is for the joined table (metabase#14793)", () => {
    visitQuestionAdhoc(QUESTION_DETAILS);

    cartesianChartCircle().eq(2).click({ force: true });

    popover().findByText("Automatic insights…").click();
    popover().findByText("X-ray").click();

    cy.wait("@xray").then(xhr => {
      for (let i = 0; i < XRAY_DATASETS; ++i) {
        cy.wait("@postDataset");
      }
      expect(xhr.status).not.to.eq(500);
      expect(xhr.response.body.cause).not.to.exist;
    });

    dashboardGrid()
      .findByText("How this metric is distributed across different numbers")
      .should("exist");

    cy.findByTestId("automatic-dashboard-header")
      .findByText(/^A closer look at/)
      .should("be.visible");

    getDashboardCards().should("have.length", 18);
  });
});

describe("issue 15342", { tags: "@external" }, () => {
  const MYSQL_DB_NAME = "QA MySQL8";
  beforeEach(() => {
    restore("mysql-8");
    cy.signInAsAdmin();

    cy.viewport(4000, 1200); // huge width required so three joined tables can fit
  });

  it("should correctly order joins for MySQL queries (metabase#15342)", () => {
    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText(MYSQL_DB_NAME).click();
      cy.findByText("People").click();
    });

    cy.icon("join_left_outer").click();
    entityPickerModal().findByText("Orders").click();
    getNotebookStep("join").findByLabelText("Right column").click();
    popover().findByText("Product ID").click();

    cy.icon("join_left_outer").last().click();
    entityPickerModal().findByText("Products").click();
    getNotebookStep("join").icon("join_left_outer").click();
    popover().findByText("Inner join").click();

    visualize();

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
    restore();
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
    openProductsTable({ mode: "notebook" });

    cy.button("Join data").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").click();
      cy.findByText(JOINED_QUESTION_NAME).click();
    });

    visualize();

    queryBuilderHeader()
      .findByTestId("question-table-badges")
      .within(() => {
        cy.findByText("Products").should("be.visible");
        cy.findByText(JOINED_QUESTION_NAME).should("be.visible");
      });

    queryBuilderMain().within(() => {
      cy.findByText("Category").should("be.visible");
      cy.findByText(`${JOINED_QUESTION_NAME} → ID`).should("be.visible");
    });
  });
});

describe("issue 17710", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    restore();
    cy.signInAsAdmin();
  });

  it("should remove only invalid join clauses (metabase#17710)", () => {
    openOrdersTable({ mode: "notebook" });

    cy.button("Join data").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });

    getNotebookStep("join").icon("add").click();

    // Close the LHS column popover that opens automatically
    getNotebookStep("join").parent().click();

    visualize();

    openNotebook();

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

    restore();
    cy.signInAsAdmin();
  });

  it("should be able to do subsequent joins on question with the aggregation that uses implicit joins (metabase#17767)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    openNotebook();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();

    // Join "Previous results" with
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Reviews").click();
    });

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("xavier");
  });
});

describe("issue 17968", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show 'Previous results' instead of a table name for non-field dimensions (metabase#17968)", () => {
    openOrdersTable({ mode: "notebook" });

    summarize({ mode: "notebook" });
    popover().findByText("Count of rows").click();

    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    popover().findByText("Created At").click();

    cy.findAllByTestId("action-buttons").last().button("Join data").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });
    popover().findByText("Count").click();

    getNotebookStep("join", { stage: 1 })
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
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to join two saved questions based on the same table (metabase#18502)", () => {
    cy.intercept("GET", "/api/collection/*/items?*").as("getCollectionContent");

    cy.createQuestion(question1);
    cy.createQuestion(question2);

    startNewQuestion();
    selectSavedQuestionsToJoin("18502#1", "18502#2");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Birth Date").click();

    visualize(response => {
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

    restore();
    cy.signInAsAdmin();
  });

  it("should join two saved questions with the same implicit/explicit grouped field (metabase#18512)", () => {
    cy.createQuestion(question1);
    cy.createQuestion(question2);

    startNewQuestion();
    selectSavedQuestionsToJoin("18512#1", "18512#2");

    popover().findByText("Products → Created At").click();
    popover().findByText("Products → Created At").click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Products → Created At");
  });
});

describe("issue 18589", () => {
  function joinTable(table) {
    cy.findByText("Join data").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText(table).click();
    });
  }

  function selectFromDropdown(option, clickOpts) {
    popover().findByText(option).click(clickOpts);
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should not bin numeric fields in join condition by default (metabase#18589)", () => {
    openOrdersTable({ mode: "notebook" });

    joinTable("Reviews");
    selectFromDropdown("Quantity");
    selectFromDropdown("Rating");

    summarize({ mode: "notebook" });
    selectFromDropdown("Count of rows");

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2,860,368");
  });
});

describe("issue 18630", () => {
  beforeEach(() => {
    restore();
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
    restore();
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

    openNotebook();
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
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
    openNotebook();
  });

  // Tightly related issue: metabase#17767
  it("should allow subsequent joins and nested query after summarizing on the implicit joins (metabase#20519)", () => {
    cy.icon("add_data").last().click();

    enterCustomColumnDetails({
      formula: "1 + 1",
      name: "Two",
    });

    cy.button("Done").click();

    getNotebookStep("expression", { stage: 1 }).contains("Two").should("exist");

    visualize(response => {
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
    restore();
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
    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").click();
      cy.findByText("22859-Q2").click();
    });

    visualize();

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
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  it("should retain the filter when drilling through the dashboard card with implicitly added column (metabase#23293)", () => {
    openOrdersTable();

    cy.findByTestId("viz-settings-button").click();
    modifyColumn("Product ID", "remove");
    modifyColumn("Category", "add");
    cy.wait("@dataset");

    queryBuilderHeader().button("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });

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
          visitDashboard(dashboard_id);
        },
      );

      // Click on the first bar
      chartPathWithFillColor("#509EE3").first().realClick();
      popover()
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

    restore();
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
        visitDashboard(dashboard_id);
      },
    );

    // Doesn't really matter which 'circle" we click on the graph
    cartesianChartCircle().last().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("See this month by week").click();
    cy.wait("@dataset");

    // Graph should still exist
    // Checks the y-axis label
    echartsContainer().findByText("Count");

    openNotebook();
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
    restore();
    cy.signInAsAdmin();
  });

  it("should show a group by column from the joined field in the summarize sidebar (metabase#27873)", () => {
    visitQuestionAdhoc(questionDetails);
    summarize();

    cy.findByTestId("aggregation-item").should("have.text", "Count");
    cy.findByTestId("pinned-dimensions")
      .should("contain", "Total")
      .and("contain", "People - User → Source");
  });
});

describe("issue 29795", () => {
  beforeEach(() => {
    restore();
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

    openOrdersTable({ mode: "notebook", limit: LIMIT });

    cy.icon("join_left_outer").click();

    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").click();
      cy.findByText(NATIVE_QUESTION).click();
    });

    popover().within(() => {
      cy.findByRole("option", { name: "ID" }).click();
    });

    popover().within(() => {
      cy.findByRole("option", { name: "USER_ID" }).click();
    });

    visualize(() => {
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
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(query, { mode: "notebook" });
  });

  it("should be possible to sort on the breakout column (metabase#30743)", () => {
    cy.findByLabelText("Sort").click();
    popover().contains("Category").click();

    visualize();
    // Check bars count
    chartPathWithFillColor("#509EE3").should("have.length", 4);
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
    restore();
    cy.signInAsAdmin();

    cy.createQuestion({ name: "Q1", query: Q1 }).then(() => {
      cy.createQuestion({ name: "Q2", query: Q2 }).then(response => {
        cy.wrap(response.body.id).as("card_id_q2");
        startNewQuestion();
      });
    });
  });

  it("shouldn't drop joins using MLv2 format (metabase#31769)", () => {
    selectSavedQuestionsToJoin("Q1", "Q2");

    popover().findByText("Products → Category").click();
    popover().findByText("Category").click();

    visualize();

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
    restore();
    cy.signInAsNormalUser();
  });

  it("should load joined table metadata for suggested join conditions (metabase#39448)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByTestId("action-buttons").button("Join data").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });
    getNotebookStep("join").within(() => {
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
    restore();
    cy.signInAsNormalUser();
  });

  it("correctly displays joined question's column names (metabase#27521)", () => {
    cy.visit("/");

    cy.log("Create Q1");
    openOrdersTable({ mode: "notebook" });

    getNotebookStep("data").button("Pick columns").click();
    popover().findByText("Select none").click();

    join();

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });

    popover().findByText("ID").click();
    popover().findByText("ID").click();

    getNotebookStep("join", { stage: 0, index: 0 })
      .button("Pick columns")
      .click();
    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByText("ID").click();
    });

    visualize();
    assertTableHeader(0, "ID");
    assertTableHeader(1, "Orders → ID");

    saveQuestion("Q1");

    assertTableHeader(0, "ID");
    assertTableHeader(1, "Orders → ID");

    cy.log("Create second question (Products + Q1)");
    newButton("Question").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("People").click();
    });

    getNotebookStep("data").button("Pick columns").click();
    popover().findByText("Select none").click();

    join();

    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").click();
      cy.findByText("Q1").click();
    });

    popover().findByText("ID").click();
    popover().findByText("Orders → ID").should("be.visible").click();
    getNotebookStep("join")
      .findByLabelText("Right column")
      .findByText("Orders → ID")
      .should("be.visible")
      .click();
    popover().findByText("ID").should("be.visible").click();

    visualize();

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
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should remove invalid draft join clause when query database changes (metabase#42385)", () => {
    openOrdersTable({ mode: "notebook" });
    join();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Reviews").click();
    });

    getNotebookStep("data").findByTestId("data-step-cell").click();
    entityPickerModal().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("Reviews").click();
    });

    getNotebookStep("join").within(() => {
      cy.findByLabelText("Right table")
        .findByText("Pick data…")
        .should("be.visible");
      cy.findByLabelText("Left column").should("not.exist");
      cy.findByLabelText("Right column").should("not.exist");
    });
  });

  it("should remove invalid join clause in incomplete draft state when query database changes (metabase#42385)", () => {
    openOrdersTable({ mode: "notebook" });
    join();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });

    getNotebookStep("join")
      .findByLabelText("Right table")
      .findByText("Products")
      .click();

    entityPickerModal().findByText("Reviews").click();

    getNotebookStep("data").findByTestId("data-step-cell").click();
    entityPickerModal().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("Reviews").click();
    });

    getNotebookStep("join").should("not.exist");
  });
});

describe("issue 45300", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("joins using the foreign key only should not break the filter modal (metabase#45300)", () => {
    visitQuestionAdhoc({
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

    filter();

    modal().within(() => {
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
