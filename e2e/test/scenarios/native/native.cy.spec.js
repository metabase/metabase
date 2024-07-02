import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { THIRD_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  openNativeEditor,
  visitQuestionAdhoc,
  summarize,
  rightSidebar,
  filter,
  filterField,
  visitCollection,
  popover,
  entityPickerModal,
  openQuestionActions,
} from "e2e/support/helpers";

describe("scenarios > question > native", () => {
  beforeEach(() => {
    cy.intercept("POST", "api/card").as("card");
    cy.intercept("POST", "api/dataset").as("dataset");
    cy.intercept("POST", "api/dataset/native").as("datasetNative");
    restore();
    cy.signInAsNormalUser();
  });

  it("lets you create and run a SQL question", () => {
    openNativeEditor().type("select count(*) from orders");
    runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("18,760");
  });

  it("should suggest the currently viewed collection when saving question", () => {
    visitCollection(THIRD_COLLECTION_ID);

    openNativeEditor({ fromCurrentPage: true }).type(
      "select count(*) from orders",
    );

    cy.findByTestId("qb-header").within(() => {
      cy.findByText("Save").click();
    });
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText(/Which collection should this go in/).should(
        "have.text",
        "Third collection",
      );
    });
  });

  it("displays an error", () => {
    openNativeEditor().type("select * from not_a_table");
    runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains('Table "NOT_A_TABLE" not found');
  });

  it("displays an error when running selected text", () => {
    openNativeEditor().type(
      "select * from orders" +
        "{leftarrow}".repeat(3) + // move left three
        "{shift}{leftarrow}".repeat(19), // highlight back to the front
    );
    runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains('Table "ORD" not found');
  });

  it("should handle template tags", () => {
    openNativeEditor().type("select * from PRODUCTS where RATING > {{Stars}}", {
      parseSpecialCharSequences: false,
    });
    cy.get("input[placeholder*='Stars']").type("3");
    runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 168 rows");
  });

  it("should modify parameters accordingly when tags are modified", () => {
    openNativeEditor().type("select * from PRODUCTS where CATEGORY = {{cat}}", {
      parseSpecialCharSequences: false,
    });
    cy.findByTestId("sidebar-right")
      .findByText("Always require a value")
      .click();
    cy.get("input[placeholder*='Enter a default value']").type("Gizmo");
    runQuery();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();

    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").type("Products on Category");
      cy.findByText("Save").click();

      cy.wait("@card").should(xhr => {
        const requestBody = xhr.request?.body;
        expect(requestBody?.parameters?.length).to.equal(1);
        const parameter = requestBody.parameters[0];
        expect(parameter.default).to.equal("Gizmo");
      });
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not now").click();
  });

  it("can save a question with no rows", () => {
    openNativeEditor().type("select * from people where false");
    runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("No results!");
    cy.icon("contract").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();

    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").type("empty question");
      cy.findByText("Save").click();
    });

    // confirm that the question saved and url updated
    cy.location("pathname").should("match", /\/question\/\d+/);
  });

  it("shouldn't remove rows containing NULL when using 'Is not' or 'Does not contain' filter (metabase#13332, metabase#37100)", () => {
    const FILTERS = ["Is not", "Does not contain"];

    const questionDetails = {
      name: "13332",
      native: {
        query:
          'SELECT null AS "V", 1 as "N" UNION ALL SELECT \'This has a value\' AS "V", 2 as "N"',
        "template-tags": {},
      },
    };

    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": `card__${id}`,
          },
          type: "query",
        },
      });
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This has a value");

    FILTERS.forEach(operator => {
      cy.log("Apply a filter");
      filter();
      filterField("V", {
        operator,
        value: "This has a value",
      });

      cy.findByTestId("apply-filters").click();

      cy.log(
        `**Mid-point assertion for "${operator}" filter| FAILING in v0.36.6**`,
      );
      cy.findByText(`V ${operator.toLowerCase()} This has a value`);
      cy.findByText("No results!").should("not.exist");

      cy.log(
        "**Final assertion: Count of rows with 'null' value should be 1**",
      );
      // "Count" is pre-selected option for "Summarize"
      summarize();
      cy.findByText("Done").click();
      cy.findByTestId("scalar-value").contains("1");

      cy.findByTestId("qb-filters-panel").within(() => {
        cy.icon("close").click();
      });
      summarize();
      rightSidebar().within(() => {
        cy.icon("close").click();
      });
      cy.findByText("Done").click();
    });
  });

  it("should be able to add new columns after hiding some (metabase#15393)", () => {
    openNativeEditor().type("select 1 as visible, 2 as hidden");
    cy.findByTestId("native-query-editor-container")
      .icon("play")
      .as("runQuery")
      .click();

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left")
      .as("sidebar")
      .contains(/hidden/i)
      .siblings("[data-testid$=hide-button]")
      .click();
    cy.get("@editor").type("{movetoend}, 3 as added");
    cy.get("@runQuery").click();
    cy.get("@sidebar").contains(/added/i);
  });

  it("should recognize template tags and save them as parameters", () => {
    openNativeEditor().type(
      "select * from PRODUCTS where CATEGORY={{cat}} and RATING >= {{stars}}",
      {
        parseSpecialCharSequences: false,
      },
    );
    cy.get("input[placeholder*='Cat']").type("Gizmo");
    cy.get("input[placeholder*='Stars']").type("3");

    runQuery();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();

    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").type("SQL Products");
      cy.findByText("Save").click();

      // parameters[] should reflect the template tags
      cy.wait("@card").then(xhr => {
        const requestBody = xhr.request?.body;
        expect(requestBody?.parameters?.length).to.equal(2);
        cy.wrap(xhr.response.body.id).as("questionId");
      });
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not now").click();

    // Now load the question again and parameters[] should still be there
    cy.get("@questionId").then(questionId => {
      cy.intercept("GET", `/api/card/${questionId}`).as("cardQuestion");
      cy.visit(`/question/${questionId}?cat=Gizmo&stars=3`);
      cy.wait("@cardQuestion").should(xhr => {
        const responseBody = xhr.response?.body;
        expect(responseBody?.parameters?.length).to.equal(2);
      });
    });
  });

  it("should not autorun ad-hoc native queries by default", () => {
    visitQuestionAdhoc(
      {
        display: "scalar",
        dataset_query: {
          type: "native",
          native: {
            query: "SELECT 1",
          },
          database: SAMPLE_DB_ID,
        },
      },
      { autorun: false },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Here's where your results will appear").should("be.visible");
  });

  it("should allow to preview a fully parameterized query", () => {
    openNativeEditor().type(
      "select * from PRODUCTS where CATEGORY={{category}}",
      { parseSpecialCharSequences: false },
    );
    cy.findByPlaceholderText("Category").type("Gadget");
    cy.button("Preview the query").click();
    cy.wait("@datasetNative");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/where CATEGORY='Gadget'/).should("be.visible");
  });

  it("should show errors when previewing a query", () => {
    openNativeEditor().type(
      "select * from PRODUCTS where CATEGORY={{category}}",
      { parseSpecialCharSequences: false },
    );
    cy.button("Preview the query").click();
    cy.wait("@datasetNative");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/missing required parameters/).should("be.visible");
  });

  describe("prompts", () => {
    const PROMPT = "orders count";
    const PROMPT_RESPONSE = { sql: "select count(*) from orders" };

    beforeEach(() => {
      cy.signInAsAdmin();
      cy.request("PUT", "/api/setting/is-metabot-enabled", { value: true });
      cy.intercept(
        "POST",
        "/api/metabot/database/**/query",
        PROMPT_RESPONSE,
      ).as("databasePrompt");
    });

    it.skip("allows generate sql queries from natural language prompts", () => {
      cy.intercept(
        "POST",
        "/api/metabot/database/**/query",
        PROMPT_RESPONSE,
      ).as("databasePrompt");

      openNativeEditor();
      ensureDatabasePickerIsHidden();

      cy.findByLabelText("Ask a question").click();

      cy.findByPlaceholderText("Ask anything...")
        .focus()
        .type(`${PROMPT}{enter}`);

      runQuery();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("18,760");

      cy.findByLabelText("Close").click();
      cy.findByDisplayValue(PROMPT).should("not.exist");
    });

    it.skip("shows an error when an sql query cannot be generated", () => {
      const errorMessage = "Could not generate a query for a given prompt";
      cy.intercept("POST", "/api/metabot/database/**/query", {
        body: {
          message: errorMessage,
        },
        statusCode: 400,
      }).as("databasePrompt");

      openNativeEditor();
      ensureDatabasePickerIsHidden();

      cy.findByLabelText("Ask a question").click();

      cy.findByPlaceholderText("Ask anything...")
        .focus()
        .type(`${PROMPT}{enter}`);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(errorMessage);
      cy.button("Try again").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(errorMessage);
      cy.button("Rephrase").click();

      cy.intercept(
        "POST",
        "/api/metabot/database/**/query",
        PROMPT_RESPONSE,
      ).as("databasePrompt");

      cy.findByDisplayValue(PROMPT).type(" fixed{enter}");
      cy.wait("@databasePrompt");

      runQuery();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("18,760");
    });
  });
});

// causes error in cypress 13
describe("no native access", { tags: ["@external", "@quarantine"] }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
    cy.intercept("/api/database?saved=true").as("database");
    cy.updatePermissionsGraph({
      [USER_GROUPS.ALL_USERS_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "blocked",
          "create-queries": "no",
        },
      },
      [USER_GROUPS.NOSQL_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
        [WRITABLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder",
        },
      },
    });

    cy.updateCollectionGraph({
      [USER_GROUPS.NOSQL_GROUP]: { root: "write" },
    });

    cy.createNativeQuestion(
      {
        name: "Secret Orders",
        native: {
          query: "SELECT * FROM ORDERS",
        },
        database: WRITABLE_DB_ID,
      },
      {
        wrapId: true,
      },
    );

    cy.signIn("nosql");
  });

  it("should not display the query when you do not have native access to the data source", () => {
    cy.get("@questionId").then(questionId =>
      cy.visit(`/question/${questionId}`),
    );

    cy.findByTestId("native-query-top-bar").within(() => {
      cy.findByText("This question is written in SQL.").should("be.visible");
      cy.findByTestId("visibility-toggler").should("not.exist");
    });

    cy.log("#32387");
    cy.findByRole("button", { name: /New/ }).click();
    popover().findByText("SQL query").click();

    cy.wait("@database");
    cy.go("back");

    cy.findByTestId("native-query-top-bar").within(() => {
      cy.findByText("This question is written in SQL.").should("be.visible");
      cy.findByTestId("visibility-toggler").should("not.exist");
    });
  });

  it(
    "shows format query button only for sql queries",
    { tags: "@mongo" },
    () => {
      const MONGO_DB_NAME = "QA Mongo";

      cy.intercept("POST", "/api/card").as("createQuestion");
      cy.intercept("POST", "/api/dataset").as("dataset");

      restore("mongo-5");
      cy.signInAsNormalUser();

      openNativeEditor({ newMenuItemTitle: "Native query" });
      popover().findByText(MONGO_DB_NAME).click();
      cy.findByLabelText("Format query").should("not.exist");

      cy.findByTestId("native-query-top-bar").findByText(MONGO_DB_NAME).click();

      // Switch to SQL engine which is supported by the formatter
      popover().findByText("Sample Database").click();

      cy.findByTestId("native-query-editor")
        .as("nativeQueryEditor")
        .type("select * from orders", {
          parseSpecialCharSequences: false,
        });

      // It should load the formatter chunk only when used
      cy.intercept("GET", "**/sql-formatter**").as("sqlFormatter");

      cy.findByLabelText("Format query").click();

      cy.wait("@sqlFormatter");

      cy.findByTestId("native-query-editor")
        .get(".ace_text-layer")
        .get(".ace_line")
        .as("lines");

      cy.get("@lines").eq(0).should("have.text", "SELECT");
      cy.get("@lines").eq(1).should("have.text", "  *");
      cy.get("@lines").eq(2).should("have.text", "FROM");
      cy.get("@lines").eq(3).should("have.text", "  orders");
    },
  );
});

describe("scenarios > native question > data reference sidebar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show tables", () => {
    openNativeEditor();
    cy.icon("reference").click();
    cy.get("[data-testid='sidebar-header-title']").findByText(
      "Sample Database",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("ORDERS").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Confirmed Sample Company orders for a product, from a user.",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("9 columns");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("QUANTITY").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Number of products bought.");
    // clicking the title should navigate back
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("QUANTITY").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("ORDERS").click();
    cy.get("[data-testid='sidebar-header-title']")
      .findByText("Sample Database")
      .click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Data Reference");
  });

  it("should show models", () => {
    cy.createNativeQuestion(
      {
        name: "Native Products Model",
        description: "A model of the Products table",
        native: { query: "select id as renamed_id from products" },
        type: "model",
      },
      { visitQuestion: true },
    );
    // Move question to personal collection
    openQuestionActions();
    popover().findByTestId("move-button").click();

    entityPickerModal().within(() => {
      cy.findByRole("tab", { name: /Collections/ }).click();
      cy.findByText("Bobby Tables's Personal Collection").click();
      cy.button("Move").click();
    });

    openNativeEditor();
    cy.icon("reference").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2 models");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Native Products Model").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("A model of the Products table"); // description
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Bobby Tables's Personal Collection"); // collection
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1 column");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("RENAMED_ID").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No description");
  });
});

const runQuery = () => {
  cy.findByTestId("native-query-editor-container").within(() => {
    cy.button("Get Answer").click();
  });
  cy.wait("@dataset");
};

function ensureDatabasePickerIsHidden() {
  cy.get("#DatabasePicker").should("not.exist");
}
