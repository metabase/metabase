import {
  restore,
  modal,
  openNativeEditor,
  visitQuestionAdhoc,
  summarize,
  rightSidebar,
  filter,
  filterField,
  getCollectionIdFromSlug,
  visitCollection,
  popover,
} from "e2e/support/helpers";

import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

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
    getCollectionIdFromSlug("third_collection", THIRD_COLLECTION_ID => {
      visitCollection(THIRD_COLLECTION_ID);
    });
    openNativeEditor({ fromCurrentPage: true }).type(
      "select count(*) from orders",
    );

    cy.findByTestId("qb-header").within(() => {
      cy.findByText("Save").click();
    });
    modal().within(() => {
      cy.findByTestId("select-button").should("have.text", "Third collection");
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
      .findByText("Required?")
      .parent()
      .find("input")
      .click();
    cy.get("input[placeholder*='Enter a default value']").type("Gizmo");
    runQuery();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();

    modal().within(() => {
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

    modal().within(() => {
      cy.findByLabelText("Name").type("empty question");
      cy.findByText("Save").click();
    });

    // confirm that the question saved and url updated
    cy.location("pathname").should("match", /\/question\/\d+/);
  });

  it(`shouldn't remove rows containing NULL when using "Is not" or "Does not contain" filter (metabase#13332)`, () => {
    const FILTERS = ["Is not", "Does not contain"];

    const questionDetails = {
      name: "13332",
      native: {
        query: `SELECT null AS "V", 1 as "N" UNION ALL SELECT 'This has a value' AS "V", 2 as "N"`,
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
      cy.get(".ScalarValue").contains("1");

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
    cy.get(".NativeQueryEditor .Icon-play").as("runQuery").click();
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

    modal().within(() => {
      cy.findByLabelText("Name").type("SQL Products");
      cy.findByText("Save").click();

      // parameters[] should reflect the template tags
      cy.wait("@card").should(xhr => {
        const requestBody = xhr.request?.body;
        expect(requestBody?.parameters?.length).to.equal(2);
      });
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not now").click();

    // Now load the question again and parameters[] should still be there
    cy.intercept("GET", "/api/card/4").as("cardQuestion");
    cy.visit("/question/4?cat=Gizmo&stars=3");
    cy.wait("@cardQuestion").should(xhr => {
      const responseBody = xhr.response?.body;
      expect(responseBody?.parameters?.length).to.equal(2);
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

  it("should allow to convert a structured query to a native query", () => {
    visitQuestionAdhoc(
      {
        display: "table",
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            limit: 1,
          },
          database: SAMPLE_DB_ID,
        },
      },
      { mode: "notebook", autorun: false },
    );

    cy.button("View the SQL").click();
    cy.wait("@datasetNative");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/FROM "PUBLIC"."ORDERS"/).should("be.visible");

    cy.button("Convert this question to SQL").click();
    runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 1 row").should("be.visible");
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

describe("no native access", () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
    cy.intercept("/api/database?saved=true").as("database");
    cy.updatePermissionsGraph({
      [USER_GROUPS.ALL_USERS_GROUP]: {
        [WRITABLE_DB_ID]: { data: { schemas: "none", native: "none" } },
      },
      [USER_GROUPS.NOSQL_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "all", native: "write" } },
        [WRITABLE_DB_ID]: { data: { schemas: "all", native: "none" } },
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
