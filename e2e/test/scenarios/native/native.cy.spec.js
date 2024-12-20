import { H } from "e2e/support";
import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { THIRD_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Count of orders",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

// cy.realType does not have an option to not parse special characters
const LEFT_BRACKET = "{{}";
const DOUBLE_LEFT_BRACKET = `${LEFT_BRACKET}${LEFT_BRACKET}`;

describe("scenarios > question > native", () => {
  beforeEach(() => {
    cy.intercept("POST", "api/card").as("card");
    cy.intercept("POST", "api/dataset").as("dataset");
    cy.intercept("POST", "api/dataset/native").as("datasetNative");
    H.restore();
    cy.signInAsNormalUser();
  });

  it("lets you create and run a SQL question", () => {
    H.openNativeEditor();
    cy.realType("select count(*) from orders");
    runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("18,760");
  });

  it("should suggest the currently viewed collection when saving question if the user has not recently visited a dashboard", () => {
    H.visitCollection(THIRD_COLLECTION_ID);

    H.openNativeEditor({ fromCurrentPage: true });
    cy.realType("select count(*) from orders");

    cy.findByTestId("qb-header").within(() => {
      cy.findByText("Save").click();
    });
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText(/Where do you want to save this/).should(
        "have.text",
        "Third collection",
      );
      cy.log("after selecting a dashboard, it should be the new suggestion");
      cy.findByLabelText(/Where do you want to save this/).click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText("Orders in a dashboard").click();
      cy.button("Select this dashboard").click();
    });

    cy.findByTestId("save-question-modal")
      .findByLabelText(/Where do you want to save this/)
      .should("have.text", "Orders in a dashboard");

    cy.visit("/");

    H.openNativeEditor({ fromCurrentPage: true });
    cy.realType("select count(*) from orders");

    cy.findByTestId("qb-header").within(() => {
      cy.findByText("Save").click();
    });
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText(/Where do you want to save this/).should(
        "have.text",
        "Orders in a dashboard",
      );

      cy.button("Cancel").click();
    });
  });

  it("displays an error", { tags: "@flaky" }, () => {
    H.openNativeEditor();
    cy.realType("select * from not_a_table");
    runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains('Table "NOT_A_TABLE" not found');
  });

  it("displays an error when running selected text", { tags: "@flaky" }, () => {
    H.openNativeEditor();
    cy.realType("select * from orders");
    // move left three
    Cypress._.range(3).forEach(() => cy.realPress("ArrowLeft"));
    // highlight back to the front
    Cypress._.range(19).forEach(() => cy.realPress(["Shift", "ArrowLeft"]));
    runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains('Table "ORD" not found');
  });

  it("should handle template tags", () => {
    H.openNativeEditor();
    cy.realType(
      `select * from PRODUCTS where RATING > ${DOUBLE_LEFT_BRACKET}Stars}}`,
    );
    cy.get("input[placeholder*='Stars']").type("3");
    runQuery();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 168 rows");
  });

  it("should modify parameters accordingly when tags are modified", () => {
    H.openNativeEditor();
    cy.realType(
      `select * from PRODUCTS where CATEGORY = ${DOUBLE_LEFT_BRACKET}cat}}`,
    );
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

  it("can save a question with no rows", { tags: "@flaky" }, () => {
    H.openNativeEditor();
    cy.realType("select * from people where false");
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
      H.visitQuestionAdhoc({
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
      H.filter();
      H.filterField("V", {
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
      H.summarize();
      cy.findByText("Done").click();
      cy.findByTestId("scalar-value").contains("1");

      cy.findByTestId("qb-filters-panel").within(() => {
        cy.icon("close").click();
      });
      H.summarize();
      H.rightSidebar().within(() => {
        cy.icon("close").click();
      });
      cy.findByText("Done").click();
    });
  });

  it(
    "should be able to add new columns after hiding some (metabase#15393)",
    { tags: "@flaky" },
    () => {
      H.openNativeEditor();
      cy.realType("select 1 as visible, 2 as hidden");
      cy.findByTestId("native-query-editor-container")
        .icon("play")
        .as("runQuery")
        .click();

      cy.findByTestId("viz-settings-button").click();
      cy.findByTestId("sidebar-left")
        .as("sidebar")
        .within(() => {
          cy.findByTestId("draggable-item-HIDDEN")
            .icon("eye_outline")
            .click({ force: true });
        });
      cy.get("@editor").type("{movetoend}, 3 as added");
      cy.get("@runQuery").click();
      cy.get("@sidebar").contains(/added/i);
    },
  );

  it("should recognize template tags and save them as parameters", () => {
    H.openNativeEditor();
    cy.realType(
      `select * from PRODUCTS where CATEGORY=${DOUBLE_LEFT_BRACKET}cat}} and RATING >= ${DOUBLE_LEFT_BRACKET}stars}}`,
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
    H.visitQuestionAdhoc(
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
    H.openNativeEditor();
    cy.realType(
      `select * from PRODUCTS where CATEGORY=${DOUBLE_LEFT_BRACKET}category}}`,
    );
    cy.findByPlaceholderText("Category").type("Gadget");
    cy.button("Preview the query").click();
    cy.wait("@datasetNative");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/where CATEGORY='Gadget'/).should("be.visible");
  });

  it("should show errors when previewing a query", () => {
    H.openNativeEditor();
    cy.realType(
      `select * from PRODUCTS where CATEGORY=${DOUBLE_LEFT_BRACKET}category}}`,
    );
    cy.button("Preview the query").click();
    cy.wait("@datasetNative");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/missing required parameters/).should("be.visible");
  });
});

// causes error in cypress 13
describe("no native access", { tags: ["@external", "@quarantine"] }, () => {
  beforeEach(() => {
    H.restore("postgres-12");
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
    H.popover().findByText("SQL query").click();

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

      H.restore("mongo-5");
      cy.signInAsNormalUser();

      H.openNativeEditor({ newMenuItemTitle: "Native query" });
      H.popover().findByText(MONGO_DB_NAME).click();
      cy.findByLabelText("Format query").should("not.exist");

      cy.findByTestId("native-query-top-bar").findByText(MONGO_DB_NAME).click();

      // Switch to SQL engine which is supported by the formatter
      H.popover().findByText("Sample Database").click();

      H.focusNativeEditor().type("select * from orders", {
        parseSpecialCharSequences: false,
      });

      // It should load the formatter chunk only when used
      cy.intercept("GET", "**/sql-formatter**").as("sqlFormatter");

      cy.findByLabelText("Format query").click();

      cy.wait("@sqlFormatter");

      H.nativeEditor().should("be.visible").get(".ace_line").as("lines");

      cy.get("@lines").eq(0).should("have.text", "SELECT");
      cy.get("@lines").eq(1).should("have.text", "  *");
      cy.get("@lines").eq(2).should("have.text", "FROM");
      cy.get("@lines").eq(3).should("have.text", "  orders");
    },
  );
});

describe("scenarios > native question > data reference sidebar", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show tables", () => {
    H.openNativeEditor();
    referenceButton().click();

    sidebarHeaderTitle().should("have.text", "Sample Database");

    dataReferenceSidebar().within(() => {
      cy.findByText("ORDERS").click();
      cy.findByText(
        "Confirmed Sample Company orders for a product, from a user.",
      );
      cy.findByText("9 columns");
      cy.findByText("QUANTITY").click();
      cy.findByText("Number of products bought.");

      cy.log("clicking the title should navigate back");
      cy.findByText("QUANTITY").click();
      cy.findByText("ORDERS").click();
      sidebarHeaderTitle().findByText("Sample Database").click();
      cy.findByText("Data Reference");
    });
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
    H.openQuestionActions();
    H.popover().findByTestId("move-button").click();

    H.entityPickerModal().within(() => {
      cy.findByRole("tab", { name: /Collections/ }).click();
      cy.findByText("Bobby Tables's Personal Collection").click();
      cy.button("Move").click();
    });

    H.openNativeEditor();
    referenceButton().click();

    dataReferenceSidebar().within(() => {
      cy.findByText("2 models");
      cy.findByText("Native Products Model").click();
      cy.findByText("A model of the Products table"); // description
      cy.findByText("Bobby Tables's Personal Collection"); // collection
      cy.findByText("1 column");
      cy.findByText("RENAMED_ID").click();
      cy.findByText("No description");
    });
  });

  describe("metrics", () => {
    it("should not show metrics when they are not defined on the selected table", () => {
      H.openNativeEditor();
      referenceButton().click();
      sidebarHeaderTitle().should("have.text", "Sample Database");

      dataReferenceSidebar().within(() => {
        cy.findByText("ORDERS").click();
        cy.findByText(/metric/).should("not.exist");
      });
    });

    it("should show metrics defined on tables", () => {
      H.createQuestion(ORDERS_SCALAR_METRIC);

      H.openNativeEditor();
      referenceButton().click();
      sidebarHeaderTitle().should("have.text", "Sample Database");

      dataReferenceSidebar().within(() => {
        cy.findByText("ORDERS").click();
        cy.findByText("1 metric").should("be.visible");

        cy.findByText("Count of orders").should("be.visible").click();
        cy.findByText("A metric").should("be.visible");

        cy.log("clicking the title should navigate back");
        cy.findByText("Count of orders").should("be.visible").click();
      });
    });
  });
});

function referenceButton() {
  return cy.icon("reference");
}

function sidebarHeaderTitle() {
  return cy.findByTestId("sidebar-header-title");
}

function dataReferenceSidebar() {
  return cy.findByTestId("sidebar-right");
}

const runQuery = () => {
  cy.findByTestId("native-query-editor-container").within(() => {
    cy.button("Get Answer").click();
  });
  cy.wait("@dataset");
};
