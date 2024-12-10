import { H } from "e2e/support";
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { NO_COLLECTION_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

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
    H.restore();
    cy.signInAsAdmin();
  });

  it("should remove dependent clauses when a clause is removed (metabase#32625, metabase#31635)", () => {
    H.visitQuestionAdhoc(QUESTION, { mode: "notebook" });

    H.getNotebookStep("expression")
      .findAllByTestId("notebook-cell-item")
      .first()
      .icon("close")
      .click();

    H.getNotebookStep("expression").should("not.exist");
    H.getNotebookStep("summarize").findByText(CC_NAME).should("not.exist");

    H.visualize();

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
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not overflow chart settings sidebar with long column name (metabase#32964)", () => {
    H.visitQuestionAdhoc(QUESTION);
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
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.request("GET", "/api/user/current").then(({ body: user }) => {
      cy.request("PUT", `/api/user/${user.id}`, { locale: "de" });
    });
  });

  it("underlying records drill should work in a non-English locale (metabase#33079)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    H.cartesianChartCircle().eq(1).click({ force: true });
    H.popover()
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
    H.restore();
    cy.signInAsNormalUser();
  });

  it("populate field values after re-adding filter on virtual table field (metabase#34414)", () => {
    cy.createQuestion(INVOICE_MODEL_DETAILS).then(response => {
      const modelId = response.body.id;

      H.visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: { "source-table": `card__${modelId}` },
        },
      });
    });

    H.openNotebook();
    H.filter({ mode: "notebook" });

    H.popover().within(() => {
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
    H.restore();
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

    cy.findByTestId("qb-header").icon("play").click();

    H.questionInfoButton().click();
    H.sidesheet().within(() => {
      cy.findByPlaceholderText("Add description")
        .type("This is a question")
        .blur();

      cy.wait("@updateQuestion");
      cy.findByRole("tab", { name: "History" }).click();
      cy.findByText(/added a description/i);
      cy.findByTestId("question-revert-button").click();

      cy.findByRole("tab", { name: "History" }).click();
      cy.findByText(/reverted to an earlier version/i).should("be.visible");
    });

    cy.findByLabelText("Close").click();
    H.tableInteractive().should("contain", "NL");
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
    H.restore();
    H.restore("postgres-12");
    cy.signInAsAdmin();
    cy.createQuestion(QUESTION_DETAILS, { visitQuestion: true });
  });

  it("should be possible to change source database (metabase#38354)", () => {
    H.openNotebook();
    H.getNotebookStep("data").findByTestId("data-step-cell").click();
    H.entityPickerModal().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
    });

    // optimization: add a limit so that query runs faster
    cy.button("Row limit").click();
    H.getNotebookStep("limit").findByPlaceholderText("Enter a limit").type("5");

    H.visualize();

    cy.findByTestId("query-builder-main")
      .findByText("There was a problem with your question")
      .should("not.exist");
    cy.get("[data-testid=cell-data]").should("contain", "37.65"); // assert visualization renders the data
  });
});

describe("issue 30056", () => {
  const questionDetails = {
    query: {
      "source-query": {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PEOPLE.LATITUDE, { "base-type": "type/Float" }],
          ["field", PEOPLE.LONGITUDE, { "base-type": "type/Float" }],
        ],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 2],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show table breadcrumbs for questions with post-aggregation filters (metabase#30056)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    // the name of the table is hidden after a few seconds with a CSS animation,
    // so check for "exist" only
    H.queryBuilderHeader().findByText("People").should("exist");
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
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to preview a multi-stage query (metabase#39102)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();

    H.getNotebookStep("data", { stage: 0 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Tax").should("be.visible");
      cy.icon("close").click();
    });

    H.getNotebookStep("summarize", { stage: 0 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("3,610").should("be.visible");
      cy.findByText("744").should("be.visible");
      cy.icon("close").click();
    });

    H.getNotebookStep("filter", { stage: 1 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("3,610").should("be.visible");
      cy.findByText("744").should("not.exist");
      cy.icon("close").click();
    });

    H.getNotebookStep("summarize", { stage: 1 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("4").should("be.visible");
    });
  });
});

describe("issue 13814", () => {
  const questionDetails = {
    display: "scalar",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count", ["field", ORDERS.TAX, { "base-type": "type/Float" }]],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should support specifying a field in 'count' MBQL clause even if the UI doesn't support it (metabase#13814)", () => {
    cy.log("verify that the API supports saving this MBQL");
    H.createQuestion(questionDetails).then(({ body: card }) =>
      H.visitQuestion(card.id),
    );

    cy.log("verify that the query is executed correctly");
    cy.findByTestId("scalar-value").findByText("18,760").should("be.visible");

    cy.log(
      "verify that the clause is displayed correctly and won't crash if updated",
    );
    H.openNotebook();
    H.getNotebookStep("summarize")
      .findByText("Count of Tax")
      .should("be.visible")
      .click();
    H.popover().findByText("Count of rows").click();
    H.getNotebookStep("summarize").findByText("Count").should("be.visible");
  });
});

describe("issue 39795", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    //If you comment out this post, then the test will pass.
    cy.request("post", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      human_readable_field_id: PRODUCTS.TITLE,
      name: "Product ID",
      type: "external",
    });
  });

  it("should allow me to re-order even when a field is set with a different display value (metabase#39795)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
        },
        type: "query",
      },
    });
    cy.findByTestId("viz-settings-button").click();
    H.moveColumnDown(H.getDraggableElements().first(), 2);

    // We are not able to re-order because the dataset will also contain values a column for Product ID
    // This causes the isValid() check to fire, and you are always forced into the default value for table.columns
    H.getDraggableElements().eq(2).should("contain.text", "ID");
  });
});

describe("issue 40176", () => {
  const DIALECT = "postgres";
  const TABLE = "uuid_pk_table";

  beforeEach(() => {
    H.restore(`${DIALECT}-writable`);
    cy.signInAsAdmin();
    H.resetTestTable({ type: DIALECT, table: TABLE });
    H.resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: TABLE,
    });
  });

  it(
    "should allow filtering on UUID PK columns (metabase#40176)",
    { tags: "@external" },
    () => {
      H.getTable({ name: TABLE }).then(({ id: tableId }) => {
        H.visitQuestionAdhoc({
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
      H.openNotebook();
      cy.findByTestId("action-buttons").findByText("Filter").click();
      H.popover().within(() => {
        cy.findByText("ID").click();
        cy.findByLabelText("Filter value").type(
          "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        );
        cy.button("Add filter").click();
      });
      H.visualize();
      cy.findByTestId("question-row-count")
        .findByText("Showing 1 row")
        .should("be.visible");
    },
  );
});

describe("issue 40435", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should make new query columns visible by default (metabase#40435)", () => {
    H.openOrdersTable();
    H.openNotebook();
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByText("User ID").click();
    });
    H.getNotebookStep("data").button("Pick columns").click();
    H.visualize();
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByTestId("ID-hide-button").click();
      cy.findByTestId("ID-show-button").click();
    });
    H.saveQuestion();

    H.openNotebook();
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("Product ID").click();
    H.queryBuilderHeader().findByText("Save").click();
    H.modal().last().findByText("Save").click();
    cy.wait("@updateCard");
    H.visualize();

    cy.findByRole("columnheader", { name: "ID" }).should("be.visible");
    cy.findByRole("columnheader", { name: "User ID" }).should("be.visible");
    cy.findByRole("columnheader", { name: "Product ID" }).should("be.visible");
  });
});

describe("issue 41381", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show an error message when adding a constant-only custom expression (metabase#41381)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();
    H.enterCustomColumnDetails({ formula: "'Test'", name: "Constant" });
    H.popover().within(() => {
      cy.findByText("Invalid expression").should("be.visible");
      cy.button("Done").should("be.disabled");
    });
  });
});

describe(
  "issue 42010 -- Unable to filter by mongo id",
  { tags: "@mongo" },
  () => {
    beforeEach(() => {
      H.restore("mongo-5");
      cy.signInAsAdmin();

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.request(`/api/database/${WRITABLE_DB_ID}/schema/`).then(({ body }) => {
        const tableId = body.find(table => table.name === "orders").id;
        H.openTable({
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
          H.filter();

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
          H.openNotebook();
          H.filter({ mode: "notebook" });

          H.popover()
            .findAllByRole("option")
            .first()
            .should("have.text", "ID")
            .click();

          cy.findByTestId("string-filter-picker").within(() => {
            cy.findByLabelText("Filter operator").should("have.text", "Is");
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
          H.visualize();
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

describe("issue 33439", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show an error message when trying to use convertTimezone on an unsupported db (metabase#33439)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula:
        'convertTimezone("2022-12-28T12:00:00", "Canada/Pacific", "Canada/Eastern")',
      name: "Date",
    });
    H.popover().within(() => {
      cy.findByText("Unsupported function convert-timezone");
      cy.button("Done").should("be.disabled");
    });
  });
});

describe("issue 42244", () => {
  const COLUMN_NAME = "Created At".repeat(5);

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      display_name: COLUMN_NAME,
    });
  });

  it("should allow to change the temporal bucket when the column name is long (metabase#42244)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().within(() => {
      cy.findByText(COLUMN_NAME).realHover();
      cy.findByText("by month").should("be.visible").click();
    });
    H.popover().last().findByText("Year").click();
    H.getNotebookStep("summarize")
      .findByText(`${COLUMN_NAME}: Year`)
      .should("be.visible");
  });
});

describe("issue 42957", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("does not show collections that contain models from different tabs (metabase#42957)", () => {
    H.createQuestion({
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
      H.createQuestion({
        name: "Question",
        type: "question",
        query: {
          "source-table": ORDERS_ID,
        },
        collection_id: collectionId,
      });
    });

    H.startNewQuestion();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Collections").click();

      cy.findByText("Collection without models").should("not.exist");
    });
  });
});

describe("issue 40064", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to edit a custom column with the same name as one of the columns used in the expression (metabase#40064)", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            Tax: ["*", ["field", ORDERS.TAX, { "base-type": "type/Float" }], 2],
          },
          limit: 1,
        },
      },
      { visitQuestion: true },
    );

    cy.log("check the initial expression value");
    H.tableInteractive().findByText("4.14").should("be.visible");

    cy.log("update the expression and check the value");
    H.openNotebook();
    H.getNotebookStep("expression").findByText("Tax").click();
    H.enterCustomColumnDetails({ formula: "[Tax] * 3" });
    H.popover().button("Update").click();
    H.visualize();
    H.tableInteractive().findByText("6.21").should("be.visible");

    cy.log("rename the expression and make sure you cannot create a cycle");
    H.openNotebook();
    H.getNotebookStep("expression").findByText("Tax").click();
    H.enterCustomColumnDetails({ formula: "[Tax] * 3", name: "Tax3" });
    H.popover().button("Update").click();
    H.getNotebookStep("expression").findByText("Tax3").click();
    H.enterCustomColumnDetails({ formula: "[Tax3] * 3", name: "Tax3" });
    H.popover().within(() => {
      cy.findByText("Cycle detected: Tax3 → Tax3").should("be.visible");
      cy.button("Update").should("be.disabled");
    });
  });
});

describe.skip("issue 10493", () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.signInAsAdmin();
  });

  it("should not reset chart axes after adding a new query stage (metabase#10493)", () => {
    H.visitQuestionAdhoc({
      display: "bar",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.QUANTITY,
              { "base-type": "type/Integer", binning: { strategy: "default" } },
            ],
          ],
          "source-table": ORDERS_ID,
        },
      },
    });

    H.filter();
    H.modal().within(() => {
      cy.findByText("Summaries").click();
      cy.findByTestId("filter-column-Count").within(() => {
        cy.findByPlaceholderText("Min").type("0");
        cy.findByPlaceholderText("Max").type("30000");
      });
      cy.button("Apply filters").click();
    });
    cy.wait("@dataset");

    H.echartsContainer().within(() => {
      // y axis
      cy.findByText("Count").should("exist");
      cy.findByText("21,000").should("exist");
      cy.findByText("3,000").should("exist");

      // x axis
      cy.findByText("Quantity").should("exist");
      cy.findByText("25").should("exist");
      cy.findByText("75").should("exist");
    });
  });
});

describe("issue 32020", () => {
  const question1Details = {
    name: "Q1",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ],
      breakout: [
        ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
      ],
    },
  };

  const question2Details = {
    name: "Q2",
    query: {
      "source-table": PEOPLE_ID,
      aggregation: [
        ["max", ["field", PEOPLE.LONGITUDE, { "base-type": "type/Float" }]],
      ],
      breakout: [
        ["field", PEOPLE.ID, { "base-type": "type/BigInteger" }],
        [
          "field",
          PEOPLE.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(question1Details);
    H.createQuestion(question2Details);
  });

  it("should be possible to use aggregation columns from source and joined questions in aggregation (metabase#32020)", () => {
    H.startNewQuestion();

    cy.log("create joined question manually");
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Collections").click();
      cy.findByText(question1Details.name).click();
    });
    H.join();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Collections").click();
      cy.findByText(question2Details.name).click();
    });
    H.popover().findByText("ID").click();
    H.popover().findByText("ID").click();

    cy.log("aggregation column from the source question");
    H.getNotebookStep("summarize")
      .findByText("Pick a function or metric")
      .click();
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Sum of Total").click();
    });

    cy.log("aggregation column from the joined question");
    H.getNotebookStep("summarize").icon("add").click();
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText(question2Details.name).click();
      cy.findByText("Max of Longitude").click();
    });

    cy.log("visualize and check results");
    H.visualize();
    H.tableInteractive().within(() => {
      cy.findByText("Sum of Sum of Total").should("be.visible");
      cy.findByText("Sum of Q2 → Max").should("be.visible");
    });
  });
});

describe("issue 44071", () => {
  const questionDetails = {
    name: "Test",
    query: { "source-table": ORDERS_ID },
    collection_id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
  };

  beforeEach(() => {
    H.restore();
    cy.signIn("nocollection");
    H.createQuestion(questionDetails);
  });

  it("should be able to save questions based on another questions without collection access (metabase#44071)", () => {
    cy.visit("/");
    H.newButton("Question").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Collections").click();
      cy.findByText(/Personal Collection/).click();
      cy.findByText(questionDetails.name).click();
    });
    H.getNotebookStep("data")
      .findByText(questionDetails.name)
      .should("be.visible");
    H.saveQuestion();
    H.appBar()
      .findByText(/Personal Collection/)
      .should("be.visible");
  });
});

describe("issue 44415", () => {
  beforeEach(() => {
    H.restore();
    cy.signIn("admin");
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          filter: [
            "and",
            [
              "not-null",
              ["field", ORDERS.DISCOUNT, { "base-type": "type/Float" }],
            ],
          ],
        },
        visualization_settings: {
          "table.columns": [
            {
              name: "ID",
              fieldRef: ["field", ORDERS.ID, null],
              enabled: true,
            },
            {
              name: "DISCOUNT",
              fieldRef: ["field", ORDERS.DISCOUNT, null],
              enabled: true,
            },
          ],
        },
      },
      { wrapId: true },
    );
  });

  it("should be able to edit a table question in the notebook editor before running its query (metabase#44415)", () => {
    cy.get("@questionId").then(questionId =>
      cy.visit(`/question/${questionId}/notebook`),
    );

    H.getNotebookStep("filter")
      .findAllByTestId("notebook-cell-item")
      .first()
      .icon("close")
      .click();

    H.getNotebookStep("filter").should("not.exist");

    H.visualize();

    cy.findByTestId("qb-filters-panel").should("not.exist");
    cy.get("@questionId").then(questionId => {
      cy.url().should("not.include", `/question/${questionId}`);
      cy.url().should("include", "question#");
    });
  });
});

describe("issue 37374", () => {
  const questionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        ["field", PRODUCTS.VENDOR, { "base-type": "type/Text" }],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(questionDetails, { wrapId: true });
    cy.signIn("nodata");
  });

  it("should allow to change the viz type to pivot without data access (metabase#37374)", () => {
    H.visitQuestion("@questionId");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/card/pivot/*/query").as("cardPivotQuery");

    cy.log("changing the viz type to pivot table and running the query works");
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("chart-type-sidebar")
      .findByTestId("Pivot Table-button")
      .click();
    cy.wait("@cardPivotQuery");
    cy.findByTestId("pivot-table").should("be.visible");

    cy.log("changing the viz type back to table and running the query works");
    cy.findByTestId("chart-type-sidebar").findByTestId("Table-button").click();
    cy.wait("@cardQuery");
    H.tableInteractive().should("be.visible");
  });
});

describe("issue 44532", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.openProductsTable();
  });

  it("should update chart metrics and dimensions with each added breakout (metabase #44532)", () => {
    H.summarize();

    H.rightSidebar()
      .findByRole("listitem", { name: "Category" })
      .button("Add dimension")
      .click();
    cy.wait("@dataset");

    H.echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis
      cy.findByText("Category").should("exist"); // x-axis

      // x-axis values
      cy.findByText("Doohickey").should("exist");
      cy.findByText("Gadget").should("exist");
      cy.findByText("Gizmo").should("exist");
      cy.findByText("Widget").should("exist");
    });

    H.rightSidebar()
      .findByRole("listitem", { name: "Created At" })
      .button("Add dimension")
      .click();
    cy.wait("@dataset");

    cy.findByLabelText("Legend").within(() => {
      cy.findByText("Doohickey").should("exist");
      cy.findByText("Gadget").should("exist");
      cy.findByText("Gizmo").should("exist");
      cy.findByText("Widget").should("exist");
    });

    H.echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis
      cy.findByText("Created At: Month").should("exist"); // x-axis

      // x-axis values
      cy.findByText("January 2023").should("exist");
      cy.findByText("January 2024").should("exist");
      cy.findByText("January 2025").should("exist");

      // previous x-axis values
      cy.findByText("Doohickey").should("not.exist");
      cy.findByText("Gadget").should("not.exist");
      cy.findByText("Gizmo").should("not.exist");
      cy.findByText("Widget").should("not.exist");
    });

    H.rightSidebar().button("Done").click();
    cy.wait("@dataset");

    cy.findByLabelText("Legend").within(() => {
      cy.findByText("Doohickey").should("exist");
      cy.findByText("Gadget").should("exist");
      cy.findByText("Gizmo").should("exist");
      cy.findByText("Widget").should("exist");
    });

    H.echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis
      cy.findByText("Created At: Month").should("exist"); // x-axis

      // x-axis values
      cy.findByText("January 2023").should("exist");
      cy.findByText("January 2024").should("exist");
      cy.findByText("January 2025").should("exist");

      // previous x-axis values
      cy.findByText("Doohickey").should("not.exist");
      cy.findByText("Gadget").should("not.exist");
      cy.findByText("Gizmo").should("not.exist");
      cy.findByText("Widget").should("not.exist");
    });
  });
});

describe("issue 33441", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show an error message for an incorrect date expression (metabase#33441)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: 'datetimeDiff([Created At] , now, "days")',
      name: "Date",
    });
    H.popover().within(() => {
      cy.findByText("Invalid expression").should("be.visible");
      cy.button("Done").should("be.disabled");
    });
  });
});

describe("issue 31960", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
    },
    display: "line",
    visualization_settings: {
      "graph.metrics": ["count"],
      "graph.dimensions": ["CREATED_AT"],
    },
  };

  // the dot that corresponds to July 10–16, 2022
  const dotIndex = 10;
  const rowCount = 11;

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should apply a date range filter for a query broken out by week (metabase#31960)", () => {
    cy.createDashboardWithQuestions({ questions: [questionDetails] }).then(
      ({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      },
    );

    H.getDashboardCard().within(() => {
      H.cartesianChartCircle().eq(dotIndex).realHover();
    });
    H.assertEChartsTooltip({
      header: "July 10–16, 2022",
      rows: [
        { name: "Count", value: String(rowCount), secondaryValue: "+10%" },
      ],
    });
    H.getDashboardCard().within(() => {
      H.cartesianChartCircle().eq(dotIndex).click({ force: true });
    });

    H.popover().findByText("See these Orders").click();
    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is Jul 10–16, 2022")
      .should("be.visible");
    H.assertQueryBuilderRowCount(rowCount);
  });
});

describe("issue 43294", () => {
  const questionDetails = {
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.metrics": ["count"],
      "graph.dimensions": ["CREATED_AT"],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not overwrite viz settings with click actions in raw data mode (metabase#43294)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.queryBuilderFooter().findByLabelText("Switch to data").click();

    // TODO: reenable this test when we reenable the "Compare to the past" components.
    // cy.log("compare action");
    // cy.button("Add column").click();
    // popover().findByText("Compare to the past").click();
    // popover().button("Done").click();

    cy.log("extract action");
    cy.button("Add column").click();
    H.popover().findByText("Extract part of column").click();
    H.popover().within(() => {
      cy.findByText("Created At: Month").click();
      cy.findByText("Year").click();
    });

    cy.log("combine action");
    cy.button("Add column").click();
    H.popover().findByText("Combine columns").click();
    H.popover().button("Done").click();

    cy.log("check visualization");
    H.queryBuilderFooter().findByLabelText("Switch to visualization").click();
    H.echartsContainer().within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("Created At: Month").should("be.visible");
    });
  });
});

describe("issue 40399", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show results from other stages in a stages preview (metabase#40399)", () => {
    H.createQuestion(
      {
        name: "40399",
        query: {
          "source-table": PRODUCTS_ID,
          joins: [
            {
              fields: "all",
              alias: "Orders",
              "source-table": ORDERS_ID,
              strategy: "left-join",
              condition: [
                "=",
                ["field", PRODUCTS.ID, null],
                ["field", ORDERS.PRODUCT_ID, { "join-alias": "Orders" }],
              ],
            },
          ],
          filter: ["=", ["field", PRODUCTS.CATEGORY, null], "Widget"],
        },
      },
      {
        visitQuestion: true,
      },
    );

    H.openNotebook();

    H.getNotebookStep("filter", { stage: 0 }).within(() => {
      cy.icon("play").click();
      cy.findByTestId("preview-root")
        .findAllByText("Widget")
        .should("be.visible");
    });

    H.getNotebookStep("join", { stage: 0 }).within(() => {
      cy.icon("play").click();
      cy.findByTestId("preview-root")
        .findAllByText("Gizmo")
        .should("be.visible");

      cy.findByTestId("preview-root").findByText("Widget").should("not.exist");
    });

    H.getNotebookStep("data", { stage: 0 }).within(() => {
      cy.icon("play").click();
      cy.findByTestId("preview-root")
        .findAllByText("Gizmo")
        .should("be.visible");

      cy.findByTestId("preview-root").findAllByText("Gizmo").should("exist");
      cy.findByTestId("preview-root").findAllByText("Widget").should("exist");
    });
  });
});

describe("issue 43057", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should differentiate between date and datetime filters with 00:00 time (metabase#43057)", () => {
    H.openOrdersTable();

    cy.log("set the date and verify the filter and results");
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.tableHeaderClick("Created At");
    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Specific dates…").click();
      cy.findByText("On").click();
      cy.findByLabelText("Date").clear().type("November 18, 2024");
      cy.button("Add filter").click();
    });
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(16);
    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is on Nov 18, 2024")
      .should("be.visible");

    cy.log("set time to 00:00 and verify the filter and results");
    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is on Nov 18, 2024")
      .click();
    H.popover().within(() => {
      cy.button("Add time").click();
      cy.findByLabelText("Time").should("have.value", "00:00");
      cy.button("Update filter").click();
    });
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(1);
    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is Nov 18, 2024, 12:00 AM")
      .should("be.visible");

    cy.log("remove time and verify the filter and results");
    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is Nov 18, 2024, 12:00 AM")
      .click();
    H.popover().within(() => {
      cy.findByLabelText("Time").should("have.value", "00:00");
      cy.button("Remove time").click();
      cy.button("Update filter").click();
    });
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(16);
    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is on Nov 18, 2024")
      .should("be.visible");
  });
});

describe("issue 19894", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show all columns when using the join column selecter (metabase#19894)", () => {
    H.createQuestion(
      {
        name: "Q1",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
      },
      {
        wrapId: true,
      },
    );

    H.createQuestion({
      name: "Q2",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["sum", ["field", PRODUCTS.PRICE, null]]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
    });

    H.createQuestion({
      name: "Q3",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["avg", ["field", PRODUCTS.RATING, null]]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
    });

    H.startNewQuestion();

    H.entityPickerModalTab("Collections").click();
    H.entityPickerModalItem(1, "Q1").click();

    cy.button("Join data").click();

    H.entityPickerModalTab("Collections").click();
    H.entityPickerModalItem(1, "Q2").click();

    H.popover().findByText("Category").click();
    H.popover().findByText("Category").click();

    cy.button("Join data").click();

    H.entityPickerModalTab("Collections").click();
    H.entityPickerModalItem(1, "Q3").click();

    H.popover().findByText("Category").should("be.visible");
    H.popover().findByText("Count").should("be.visible");

    H.popover().findByText("Q1").click();
    H.popover().findByText("Q2").click();

    H.popover().findByText("Category").should("be.visible");
    H.popover().findByText("Sum of Price").should("be.visible");

    H.popover().findByText("Q1").click();

    H.popover().findByText("Category").should("be.visible");
    H.popover().findByText("Count").should("be.visible");
  });
});

describe("issue 44637", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not crash when rendering a line/bar chart with empty results (metabase#44637)", () => {
    H.createNativeQuestion(
      {
        native: {
          query: "SELECT '2023-01-01'::date, 2 FROM people WHERE false",
        },
      },
      { visitQuestion: true },
    );

    H.assertQueryBuilderRowCount(0);
    H.queryBuilderMain().findByText("No results!").should("exist");
    H.queryBuilderFooter().button("Visualization").click();
    H.leftSidebar().icon("bar").click();
    H.queryBuilderMain().within(() => {
      cy.findByText("No results!").should("exist");
      cy.findByText("Something's gone wrong").should("not.exist");
    });

    H.queryBuilderFooter().icon("calendar").click();
    H.rightSidebar().findByText("Add an event");
  });
});

describe("issue 44668", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not drop graph.metrics after adding a new query stage (metabase#44668)", () => {
    H.createQuestion(
      {
        display: "bar",
        query: {
          aggregation: [["count"]],
          breakout: [["field", PEOPLE.STATE, { "base-type": "type/Text" }]],
          "source-table": PEOPLE_ID,
          limit: 5,
        },
        visualization_settings: {
          "graph.metrics": ["count"],
          "graph.dimensions": ["STATE"],
        },
      },
      { visitQuestion: true },
    );

    H.openNotebook();

    cy.findAllByTestId("action-buttons").last().button("Custom column").click();
    H.enterCustomColumnDetails({
      formula: 'concat("abc_", [Count])',
      name: "Custom String",
    });
    H.popover().button("Done").click();

    H.getNotebookStep("expression", { stage: 1 }).icon("add").click();
    H.enterCustomColumnDetails({
      formula: "[Count] * 2",
      name: "Custom Number",
    });
    H.popover().button("Done").click();

    H.visualize();

    H.echartsContainer().within(() => {
      cy.findByText("State").should("be.visible"); // x-axis
      cy.findByText("Count").should("be.visible"); // y-axis

      // x-axis values
      ["AK", "AL", "AR", "AZ", "CA"].forEach(state => {
        cy.findByText(state).should("be.visible");
      });
    });

    // Ensure custom columns weren't added as series automatically
    H.queryBuilderMain().findByLabelText("Legend").should("not.exist");

    cy.findByTestId("viz-settings-button").click();

    // Ensure can use Custom Number as series
    H.leftSidebar().findByText("Add another series").click();
    H.queryBuilderMain()
      .findByLabelText("Legend")
      .within(() => {
        cy.findByText("Count").should("exist");
        cy.findByText("Custom Number").should("exist");
      });
    H.leftSidebar().within(() => {
      cy.findByText("Add another series").should("not.exist");
      cy.findByText("Add series breakout").should("not.exist");
      cy.findByTestId("remove-Custom Number").click();
    });
    H.queryBuilderMain().findByLabelText("Legend").should("not.exist");

    H.leftSidebar().findByText("Add series breakout").click();
    H.popover().within(() => {
      cy.findByText("Count").should("exist");
      cy.findByText("Custom Number").should("exist");
      cy.findByText("Custom String").click();
    });
    H.queryBuilderMain()
      .findByLabelText("Legend")
      .within(() => {
        ["68", "56", "49", "20", "90"].forEach(value => {
          cy.findByText(`abc_${value}`).should("exist");
        });
      });
    H.leftSidebar().within(() => {
      cy.findByText("Add another series").should("not.exist");
      cy.findByText("Add series breakout").should("not.exist");
    });
  });
});

describe("issue 44974", () => {
  const PG_DB_ID = 2;

  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("entity picker should not offer to join with a table or a question from a different database (metabase#44974)", () => {
    H.withDatabase(PG_DB_ID, ({ PEOPLE_ID }) => {
      const questionDetails = {
        name: "Question 44974 in Postgres DB",
        database: PG_DB_ID,
        query: {
          "source-table": PEOPLE_ID,
          limit: 1,
        },
      };

      H.createQuestion(questionDetails, {
        // Visit question to put it in recents
        visitQuestion: true,
      });

      H.openOrdersTable({ mode: "notebook" });
      H.join();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Recents").should("not.exist");
        H.entityPickerModalTab("Collections").click();
        cy.findByText(questionDetails.name).should("not.exist");
      });
    });
  });
});

describe("issue 38989", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be impossible to join with a table or question which is not in the same database (metabase#38989)", () => {
    H.createQuestion(
      {
        query: {
          "source-table": PEOPLE_ID,
          fields: [
            ["field", PEOPLE.ID, { "base-type": "type/Number" }],
            ["field", PEOPLE.EMAIL, { "base-type": "type/Text" }],
          ],
          joins: [
            {
              fields: "all",
              alias: "Orders",
              // This is not a valid table ID in the Sample Database
              "source-table": 123,
              strategy: "left-join",
              condition: [
                "=",
                ["field", PEOPLE.ID, null],
                ["field", ORDERS.USER_ID, { "join-alias": "Orders" }],
              ],
            },
          ],
        },
      },
      {
        visitQuestion: true,
      },
    );

    cy.findByTestId("query-builder-main")
      .findByText("Show error details")
      .click();

    cy.findByTestId("query-builder-main")
      .findByText(
        /either it does not exist, or it belongs to a different Database/,
      )
      .should("exist");
  });
});

describe("issue 39771", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show tooltip for ellipsified text (metabase#39771)", () => {
    H.createQuestion(
      {
        query: {
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              "CREATED_AT",
              {
                "base-type": "type/DateTime",
                "temporal-unit": "quarter-of-year",
              },
            ],
          ],
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "temporal-unit": "month",
                },
              ],
            ],
          },
        },
      },
      { visitQuestion: true },
    );

    H.openNotebook();
    H.getNotebookStep("summarize", { stage: 1 })
      .findByTestId("breakout-step")
      .findByText("Created At: Month: Quarter of year")
      .click();

    H.popover().findByText("by quarter of year").realHover();

    H.popover().then(([$popover]) => {
      const popoverStyle = window.getComputedStyle($popover);
      const popoverZindex = parseInt(popoverStyle.zIndex, 10);

      cy.findByTestId("ellipsified-tooltip").within(([$tooltip]) => {
        cy.findByText("by quarter of year").should("be.visible");

        const tooltipStyle = window.getComputedStyle($tooltip);
        const tooltipZindex = parseInt(tooltipStyle.zIndex, 10);

        // resort to asserting zIndex because should("be.visible") passes unexpectedly
        expect(tooltipZindex).to.be.gte(popoverZindex);
      });
    });
  });
});

describe("issue 45063", () => {
  function createGuiQuestion({ sourceTableId }) {
    const questionDetails = {
      name: "Question",
      query: {
        "source-table": sourceTableId,
      },
    };
    H.createQuestion(questionDetails, { wrapId: true });
  }

  function createGuiModel({ sourceTableId }) {
    const mbqlModelDetails = {
      name: "Model",
      type: "model",
      query: {
        "source-table": sourceTableId,
      },
    };
    H.createQuestion(mbqlModelDetails, { wrapId: true, idAlias: "modelId" });
  }

  function createNativeModel({
    tableName,
    fieldId,
    fieldName,
    fieldSemanticType,
  }) {
    const nativeModelDetails = {
      name: "Native Model",
      type: "model",
      native: {
        query: `SELECT * FROM ${tableName}`,
      },
    };
    H.createNativeQuestion(nativeModelDetails, {
      wrapId: true,
      idAlias: "modelId",
    }).then(({ body: model }) => {
      cy.log("populate result_metadata");
      cy.request("POST", `/api/card/${model.id}/query`);
      cy.log("map columns to database fields");
      H.setModelMetadata(model.id, field => {
        if (field.name === fieldName) {
          return { ...field, id: fieldId, semantic_type: fieldSemanticType };
        }
        return field;
      });
    });
  }

  function setListValues({ fieldId }) {
    cy.request("PUT", `/api/field/${fieldId}`, {
      has_field_values: "list",
    });
  }

  function setSearchValues({ fieldId }) {
    cy.request("PUT", `/api/field/${fieldId}`, {
      has_field_values: "search",
    });
  }

  function setForeignKeyRemapping({
    sourceFieldId,
    targetFieldId,
    remappedDisplayName,
  }) {
    cy.request("POST", `/api/field/${sourceFieldId}/dimension`, {
      type: "external",
      name: remappedDisplayName,
      human_readable_field_id: targetFieldId,
    });
  }

  function verifyListFilter({ fieldDisplayName, fieldValue, fieldValueLabel }) {
    H.tableHeaderClick(fieldDisplayName);
    H.popover().findByText("Filter by this column").click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Search the list").type(fieldValueLabel);
      cy.findByText(fieldValueLabel).click();
      cy.button("Add filter").click();
    });
    cy.findByTestId("qb-filters-panel")
      .findByText(`${fieldDisplayName} is ${fieldValue}`)
      .click();
    H.popover().findByLabelText(fieldValueLabel).should("be.checked");
  }

  function verifySearchFilter({
    fieldDisplayName,
    fieldValue,
    fieldValueLabel,
  }) {
    H.tableHeaderClick(fieldDisplayName);
    H.popover().findByText("Filter by this column").click();
    H.popover()
      .findByPlaceholderText(`Search by ${fieldDisplayName}`)
      .type(fieldValueLabel);
    H.popover().last().findByText(fieldValueLabel).click();
    H.popover().first().click().button("Add filter").click();
    cy.findByTestId("qb-filters-panel")
      .findByText(`${fieldDisplayName} is ${fieldValue}`)
      .should("be.visible");
  }

  function verifyRemappedFilter({
    visitCard,
    fieldId,
    fieldDisplayName,
    fieldValue,
    fieldValueLabel,
    expectedRowCount,
  }) {
    cy.log("list values");
    cy.signInAsAdmin();
    setListValues({ fieldId });
    cy.signInAsNormalUser();
    visitCard();
    verifyListFilter({ fieldDisplayName, fieldValue, fieldValueLabel });
    H.assertQueryBuilderRowCount(expectedRowCount);

    cy.log("search values");
    cy.signInAsAdmin();
    setSearchValues({ fieldId });
    cy.signInAsNormalUser();
    visitCard();
    verifySearchFilter({ fieldDisplayName, fieldValue, fieldValueLabel });
    H.assertQueryBuilderRowCount(expectedRowCount);
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("type/PK -> type/Name remapping (metabase#45063)", () => {
    it("should work with questions", () => {
      createGuiQuestion({ sourceTableId: PEOPLE_ID });
      verifyRemappedFilter({
        visitCard: () => H.visitQuestion("@questionId"),
        fieldId: PEOPLE.ID,
        fieldDisplayName: "ID",
        fieldValue: 1,
        fieldValueLabel: "Hudson Borer",
        expectedRowCount: 1,
      });
    });

    it("should work with models", () => {
      createGuiModel({ sourceTableId: PEOPLE_ID });
      verifyRemappedFilter({
        visitCard: () => cy.get("@modelId").then(H.visitModel),
        fieldId: PEOPLE.ID,
        fieldDisplayName: "ID",
        fieldValue: 1,
        fieldValueLabel: "Hudson Borer",
        expectedRowCount: 1,
      });
    });

    it("should work with native models", () => {
      createNativeModel({
        tableName: "PEOPLE",
        fieldId: PEOPLE.ID,
        fieldName: "ID",
        fieldSemanticType: "type/PK",
      });
      verifyRemappedFilter({
        visitCard: () => cy.get("@modelId").then(H.visitModel),
        fieldId: PEOPLE.ID,
        fieldDisplayName: "ID",
        fieldValue: 1,
        fieldValueLabel: "Hudson Borer",
        expectedRowCount: 1,
      });
    });
  });

  describe("type/FK -> column remapping (metabase#45063)", () => {
    beforeEach(() => {
      setForeignKeyRemapping({
        sourceFieldId: ORDERS.PRODUCT_ID,
        targetFieldId: PRODUCTS.TITLE,
        remappedDisplayName: "Product ID",
      });
    });

    it("should work with questions", () => {
      createGuiQuestion({ sourceTableId: ORDERS_ID });
      verifyRemappedFilter({
        visitCard: () => H.visitQuestion("@questionId"),
        fieldId: ORDERS.PRODUCT_ID,
        fieldDisplayName: "Product ID",
        fieldValue: 1,
        fieldValueLabel: "Rustic Paper Wallet",
        expectedRowCount: 93,
      });
    });

    it("should work with models", () => {
      createGuiModel({ sourceTableId: ORDERS_ID });
      verifyRemappedFilter({
        visitCard: () => cy.get("@modelId").then(H.visitModel),
        fieldId: ORDERS.PRODUCT_ID,
        fieldDisplayName: "Product ID",
        fieldValue: 1,
        fieldValueLabel: "Rustic Paper Wallet",
        expectedRowCount: 93,
      });
    });

    it("should work with native models", () => {
      createNativeModel({
        tableName: "ORDERS",
        fieldId: ORDERS.PRODUCT_ID,
        fieldName: "PRODUCT_ID",
        fieldSemanticType: "type/FK",
      });
      verifyRemappedFilter({
        visitCard: () => cy.get("@modelId").then(H.visitModel),
        fieldId: ORDERS.PRODUCT_ID,
        fieldDisplayName: "PRODUCT_ID",
        fieldValue: 1,
        fieldValueLabel: "Rustic Paper Wallet",
        expectedRowCount: 93,
      });
    });
  });
});

describe("issue 41464", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not overlap 'no results' and the loading state (metabase#41464)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: [
            ">",
            ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
            1000,
          ],
        },
        parameters: [],
      },
    });

    cy.intercept(
      {
        method: "POST",
        url: "/api/dataset",
        middleware: true,
      },
      req => {
        req.on("response", res => {
          // Throttle the response to 50kbps
          res.setThrottle(50);
        });
      },
    );

    cy.findByTestId("filter-pill")
      .should("have.text", "Total is greater than 1000")
      .icon("close")
      .click();

    cy.findByTestId("query-builder-main").within(() => {
      cy.findByTestId("loading-indicator").should("be.visible");
      cy.findByText("No results!", { timeout: 500 }).should("not.exist");
    });
  });
});

describe.skip("issue 45359", () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("/app/fonts/Lato/lato-v16-latin-regular.woff2").as(
      "font-regular",
    );
    cy.intercept("/app/fonts/Lato/lato-v16-latin-700.woff2").as("font-bold");
    cy.signInAsAdmin();
  });

  it("loads app fonts correctly (metabase#45359)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.getNotebookStep("data")
      .findByText("Orders")
      .should("have.css", "font-family", "Lato, sans-serif");

    cy.get("@font-regular.all").should("have.length", 1);
    cy.get("@font-regular").should(({ response }) => {
      expect(response).to.include({ statusCode: 200 });
    });

    cy.get("@font-bold.all").should("have.length", 1);
    cy.get("@font-bold").should(({ response }) => {
      expect(response).to.include({ statusCode: 200 });
    });

    cy.document()
      .then(document => document.fonts.ready)
      .then(fonts => {
        cy.wrap(fonts).invoke("check", "16px Lato").should("be.true");
      });
  });
});

describe("issue 45452", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should only have one scrollbar for the summarize sidebar (metabase#45452)", () => {
    H.openOrdersTable();
    H.summarize();

    cy.findByTestId("summarize-aggregation-item-list").then($el => {
      const element = $el[0];
      expectNoScrollbarContainer(element);
    });

    cy.findByTestId("summarize-breakout-column-list").then($el => {
      const element = $el[0];
      expectNoScrollbarContainer(element);
    });

    // the sidebar is the only element with a scrollbar
    cy.findByTestId("sidebar-content").then($el => {
      const element = $el[0];
      expect(element.scrollHeight > element.clientHeight).to.be.true;
      expect(element.offsetWidth > element.clientWidth).to.be.true;
    });
  });
});

describe("issue 41612", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("createQuestion");
  });

  it("should not ignore chart viz settings when viewing raw results as a table (metabase#41612)", () => {
    H.visitQuestionAdhoc(
      {
        display: "line",
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
            "source-table": ORDERS_ID,
          },
        },
      },
      { visitQuestion: true },
    );

    H.queryBuilderMain().findByLabelText("Switch to data").click();
    H.queryBuilderHeader().button("Save").click();
    H.modal().button("Save").click();

    cy.wait("@createQuestion").then(xhr => {
      const card = xhr.request.body;
      expect(card.visualization_settings["graph.metrics"]).to.deep.equal([
        "count",
      ]);
      expect(card.visualization_settings["graph.dimensions"]).to.deep.equal([
        "CREATED_AT",
      ]);
    });
  });
});

describe("issue 36027", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    const CONCRETE_CREATED_AT_FIELD_REF = [
      "field",
      ORDERS.CREATED_AT,
      { "base-type": "type/DateTime", "temporal-unit": "month" },
    ];

    const CREATED_AT_FIELD_REF = [
      "field",
      "CREATED_AT",
      { "base-type": "type/DateTime", "temporal-unit": "month" },
    ];

    const BASE_QUERY = {
      aggregation: [["count"]],
      breakout: [CONCRETE_CREATED_AT_FIELD_REF],
      "source-table": ORDERS_ID,
    };

    H.createQuestion({ query: BASE_QUERY }, { wrapId: true }).then(
      baseQuestionId => {
        H.createQuestion(
          {
            display: "waterfall",
            query: {
              aggregation: [
                ["sum", ["field", "count", { "base-type": "type/Integer" }]],
              ],
              breakout: [CREATED_AT_FIELD_REF],
              joins: [
                {
                  alias: "Q1",
                  strategy: "left-join",
                  "source-table": `card__${baseQuestionId}`,
                  condition: [
                    "<=",
                    CREATED_AT_FIELD_REF,
                    CONCRETE_CREATED_AT_FIELD_REF,
                  ],
                },
              ],
              "source-query": BASE_QUERY,
            },
            visualization_settings: {
              "graph.dimensions": ["CREATED_AT"],
              "graph.metrics": ["sum"],
            },
          },
          { visitQuestion: true },
        );
      },
    );
  });

  it("should use default metrics/dimensions if they're missing after removing some query clauses (metabase#36027)", () => {
    H.openNotebook();
    H.getNotebookStep("summarize", { stage: 1 })
      .findByLabelText("Remove step")
      .click({ force: true });
    H.getNotebookStep("join", { stage: 1 })
      .findByLabelText("Remove step")
      .click({ force: true });
    H.visualize();

    H.echartsContainer().within(() => {
      cy.findByText("Created At: Month").should("be.visible"); // x-axis
      cy.findByText("Count").should("be.visible"); // y-axis

      // x-axis values
      ["January 2023", "January 2024", "January 2025", "January 2026"].forEach(
        state => {
          cy.findByText(state).should("be.visible");
        },
      );

      // y-axis values
      [
        "0",
        "3,000",
        "6,000",
        "9,000",
        "12,000",
        "15,000",
        "18,000",
        "21,000",
      ].forEach(state => {
        cy.findByText(state).should("be.visible");
      });
    });
  });
});

describe("issue 12586", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not show the run button overlay when an error occurs (metabase#12586)", () => {
    H.openOrdersTable();
    H.summarize();

    cy.intercept("POST", "/api/dataset", req => req.destroy());

    H.rightSidebar().button("Done").click();
    H.main()
      .findByText("We're experiencing server issues")
      .should("be.visible");
    cy.findByTestId("query-builder-main").icon("play").should("not.be.visible");
  });
});

function expectNoScrollbarContainer(element) {
  const hasScrollbarContainer =
    element.scrollHeight <= element.clientHeight &&
    element.offsetWidth > element.clientWidth;

  expect(hasScrollbarContainer).to.be.false;
}

describe("issue 48829", () => {
  const questionDetails = {
    name: "Issue 48829",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not show the unsaved changes warning when switching back to chill mode from the notebook editor after adding a filter from headers (metabase#48829)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });

    H.tableHeaderClick("Category");
    H.popover().findByText("Filter by this column").click();
    H.popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.findByText("Add filter").click();
    });

    H.queryBuilderHeader().button("Show Editor").click();
    H.getNotebookStep("filter")
      .findAllByTestId("notebook-cell-item")
      .icon("close")
      .should("be.visible")
      .click();

    H.visualize();

    H.modal().should("not.exist");
  });

  it("should not show the unsaved changes warning when switching back to chill mode from the notebook editor after adding a filter via the filter modal (metabase#48829)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });

    H.queryBuilderHeader().button("Filter").click();
    H.modal().within(() => {
      cy.findByText("Doohickey").click();
      cy.button("Apply filters").click();
    });

    H.queryBuilderHeader().button("Show Editor").click();
    H.getNotebookStep("filter")
      .findAllByTestId("notebook-cell-item")
      .icon("close")
      .should("be.visible")
      .click();

    H.visualize();

    H.modal().should("not.exist");
  });

  it("should not show the unsaved changes warning when switching back to chill mode from the notebook editor after visiting a filtered question from a dashboard click action (metabase#48829)", () => {
    // Set up dashboard
    cy.createDashboardWithQuestions({ questions: [questionDetails] }).then(
      ({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      },
    );

    H.showDashboardCardActions();
    H.editDashboard();
    H.getDashboardCard().findByLabelText("Click behavior").click();

    H.sidebar().within(() => {
      cy.findByText("Title").click();
      cy.findByText("Go to a custom destination").click();
      cy.findByText("Saved question").click();
    });

    H.entityPickerModal().findByText(questionDetails.name).click();
    H.sidebar().findByTestId("click-mappings").findByText("Title").click();
    H.popover().findByText("Title").click();
    H.saveDashboard();

    // Navigate to question using click action in dashboard
    H.main().findByText("Rustic Paper Wallet").click();

    H.queryBuilderHeader().button("Show Editor").click();
    H.getNotebookStep("filter")
      .findAllByTestId("notebook-cell-item")
      .icon("close")
      .should("be.visible")
      .click();

    H.visualize();

    H.modal().should("not.exist");
  });
});

describe("issue 50038", () => {
  const QUESTION = {
    name: "question with a very long name that will be too long to fit on one line which normally would result in some weird looking buttons with inconsistent heights",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const OTHER_QUESTION = {
    name: "question that also has a long name that is so long it will break in the button",
    query: {
      "source-table": ORDERS_ID,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(QUESTION, { wrapId: true, idAlias: "questionId" });
    H.createQuestion(OTHER_QUESTION, {
      wrapId: true,
      idAlias: "otherQuestionId",
    });

    cy.get("@questionId").then(questionId => {
      cy.get("@otherQuestionId").then(otherQuestionId => {
        H.createQuestion(
          {
            name: "Joined question",
            query: {
              "source-table": `card__${questionId}`,
              joins: [
                {
                  "source-table": `card__${otherQuestionId}`,
                  fields: "all",
                  strategy: "left-join",
                  condition: [
                    "=",
                    ["field", ORDERS_ID, {}],
                    ["field", PRODUCTS_ID, {}],
                  ],
                },
              ],
            },
          },
          { visitQuestion: true },
        );
      });
    });
  });

  function assertEqualHeight(selector, otherSelector) {
    selector.invoke("outerHeight").then(height => {
      otherSelector.invoke("outerHeight").should("eq", height);
    });
  }

  it("should not break data source and join source buttons when the source names are too long (metabase#50038)", () => {
    H.openNotebook();
    H.getNotebookStep("data").within(() => {
      assertEqualHeight(
        cy.findByText(QUESTION.name).parent().should("be.visible"),
        cy.findByTestId("fields-picker").should("be.visible"),
      );
    });
    H.getNotebookStep("join").within(() => {
      assertEqualHeight(
        cy
          .findAllByText(OTHER_QUESTION.name)
          .first()
          .parent()
          .should("be.visible"),
        cy.findByTestId("fields-picker").should("be.visible"),
      );
    });
  });
});

describe("issue 47940", () => {
  const questionDetails = {
    name: "Issue 47940",
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should be able to convert a question with date casting to a model", () => {
    cy.log("create a question without any column casting");
    H.createQuestion(questionDetails, { visitQuestion: true });
    cy.wait("@cardQuery");

    cy.log("add coercion");
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      semantic_type: "type/Category",
      coercion_strategy: "Coercion/UNIXMicroSeconds->DateTime",
    });

    cy.log("get new query results with coercion applied");
    H.queryBuilderHeader().findByTestId("run-button").click();
    cy.wait("@cardQuery");
    H.queryBuilderHeader().button("Save").click();
    H.modal().button("Save").click();
    cy.wait("@updateCard");

    cy.log("turn into a model");
    H.openQuestionActions();
    H.popover().findByText("Turn into a model").click();
    cy.findByRole("dialog").findByText("Turn this into a model").click();
    cy.wait("@updateCard");

    cy.log("verify there is a table displayed");
    cy.findByTestId("visualization-root").should(
      "contain",
      "December 31, 1969, 4:00 PM",
    );
  });
});
