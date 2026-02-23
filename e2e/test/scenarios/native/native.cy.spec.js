const { H } = cy;
import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { THIRD_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID, ORDERS, PEOPLE } = SAMPLE_DATABASE;

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

describe("scenarios > question > native", () => {
  beforeEach(() => {
    cy.intercept("POST", "api/card").as("card");
    cy.intercept("POST", "api/dataset").as("dataset");
    cy.intercept("POST", "api/dataset/native").as("datasetNative");
    H.restore();
    cy.signInAsNormalUser();
  });

  it("lets you create and run a SQL question", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select count(*) from orders");

    runQuery();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("18,760");
  });

  it("should suggest the currently viewed collection when saving question if the user has not recently visited a dashboard", () => {
    H.visitCollection(THIRD_COLLECTION_ID);
    H.startNewNativeQuestion({ collection_id: THIRD_COLLECTION_ID });

    H.NativeEditor.type("select count(*) from orders");

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

    H.startNewNativeQuestion();
    H.NativeEditor.type("select count(*) from orders");

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

  it("displays an error", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from not_a_table");

    runQuery();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains('Table "NOT_A_TABLE" not found');
  });

  it("displays an error when running selected text", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from orders");

    // move left three
    Cypress._.range(3).forEach(() => cy.realPress("ArrowLeft"));
    // highlight back to the front
    Cypress._.range(19).forEach(() => cy.realPress(["Shift", "ArrowLeft"]));
    runQuery();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains('Table "ORD" not found');
  });

  describe("template tags", () => {
    it("should handle template tags", () => {
      H.startNewNativeQuestion();
      H.NativeEditor.type("select * from PRODUCTS where RATING > {{Stars}}");

      cy.get("input[placeholder*='Stars']").type("3");
      runQuery();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("Showing 168 rows");
    });

    it("should modify parameters accordingly when tags are modified", () => {
      H.startNewNativeQuestion();
      H.NativeEditor.type("select * from PRODUCTS where CATEGORY = {{cat}}");

      cy.findByTestId("sidebar-right")
        .findByText("Always require a value")
        .click();
      cy.get("input[placeholder*='Enter a default value']").type("Gizmo");
      runQuery();

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("Save").click();

      cy.findByTestId("save-question-modal").within(() => {
        cy.findByLabelText("Name").type("Products on Category");
        cy.findByText("Save").click();

        cy.wait("@card").should((xhr) => {
          const requestBody = xhr.request?.body;
          expect(requestBody?.parameters?.length).to.equal(1);
          const parameter = requestBody.parameters[0];
          expect(parameter.default).to.equal("Gizmo");
        });
      });
    });

    it("should recognize template tags and save them as parameters", () => {
      H.startNewNativeQuestion();
      H.NativeEditor.type(
        "select * from PRODUCTS where CATEGORY={{cat}} and RATING >= {{stars}}",
      );
      cy.get("input[placeholder*='Cat']").type("Gizmo");
      cy.get("input[placeholder*='Stars']").type("3");

      runQuery();

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("Save").click();

      cy.findByTestId("save-question-modal").within(() => {
        cy.findByLabelText("Name").type("SQL Products");
        cy.findByText("Save").click();

        // parameters[] should reflect the template tags
        cy.wait("@card").then((xhr) => {
          const requestBody = xhr.request?.body;
          expect(requestBody?.parameters?.length).to.equal(2);
          cy.wrap(xhr.response.body.id).as("questionId");
        });
      });

      // Now load the question again and parameters[] should still be there
      cy.get("@questionId").then((questionId) => {
        cy.intercept("GET", `/api/card/${questionId}`).as("cardQuestion");
        cy.visit(`/question/${questionId}?cat=Gizmo&stars=3`);
        cy.wait("@cardQuestion").should((xhr) => {
          const responseBody = xhr.response?.body;
          expect(responseBody?.parameters?.length).to.equal(2);
        });
      });
    });

    describe("time grouping", () => {
      function setVariableType() {
        H.rightSidebar().findByTestId("variable-type-select").click();
        H.popover().findByText("Time grouping").click();
      }

      function setVariableTypeAndField() {
        setVariableType();
        H.popover().within(() => {
          cy.findByText("Orders").click();
          cy.findByText("Created At").click();
        });
      }

      it("should create entries in variables sidebar", () => {
        H.startNewNativeQuestion();
        H.NativeEditor.type(
          "SELECT count(*), {{unit}} as unit FROM ORDERS GROUP BY unit",
        );
        setVariableTypeAndField();
        H.rightSidebar()
          .findByLabelText("Parameter widget label")
          .type(" updated")
          .blur();
        H.filterWidget({ name: "Unit updated" }).should("exist");
      });

      it("should handle required prop for time grouping", () => {
        H.startNewNativeQuestion();
        H.NativeEditor.type(
          "SELECT count(*), {{unit}} as unit FROM ORDERS GROUP BY unit",
        );
        setVariableTypeAndField();
        H.rightSidebar()
          .findByLabelText("Always require a value")
          .parent()
          .click();
        H.runNativeQuery();
        cy.findByTestId("query-visualization-root").should(
          "contain",
          "You'll need to pick a value for 'Unit' before this query can run.",
        );

        H.rightSidebar().within(() => {
          cy.findByText("Enter a default value…").click();
        });
        H.popover().findByText("Year").click();
        H.runNativeQuery();
        cy.findByTestId("query-visualization-root").should(
          "contain",
          "January 1, 2022",
        );
      });

      it("should run saved question with time grouping", () => {
        const questionWithDefaultValue = {
          name: "Saved question with time grouping",
          native: {
            query:
              "SELECT count(*), {{unit}} as unit FROM ORDERS GROUP BY unit",
            "template-tags": {
              unit: {
                type: "temporal-unit",
                name: "unit",
                id: "eb345703-001c-4b2a-b7d5-71cb3efe4beb",
                "display-name": "Unit",
                dimension: ["field", ORDERS.CREATED_AT, null],
                required: true,
                default: "year",
              },
            },
          },
        };
        const questionWithoutDefaultValue = {
          name: "Saved question with time grouping",
          native: {
            query:
              "SELECT count(*), {{unit}} as unit FROM ORDERS GROUP BY unit",
            "template-tags": {
              unit: {
                type: "temporal-unit",
                name: "unit",
                id: "eb345703-001c-4b2a-b7d5-71cb3efe4beb",
                "display-name": "Unit",
                dimension: ["field", ORDERS.CREATED_AT, null],
                required: true,
              },
            },
          },
        };

        H.createNativeQuestion(questionWithDefaultValue, {
          wrapId: true,
          idAlias: "q1",
        }).then(() => {
          return H.createNativeQuestion(questionWithoutDefaultValue, {
            wrapId: true,
            idAlias: "q2",
          });
        });

        cy.get("@q1").then((questionId) => {
          H.visitQuestion(questionId);
        });

        cy.log(
          "verify that saved query with time grouping can run and return correct results",
        );
        cy.findByTestId("visualization-root").should(
          "contain",
          "January 1, 2022",
        );

        cy.get("@q2").then((questionId) => {
          H.visitQuestion(questionId);
        });

        cy.log(
          "verify that saved query without time grouping can run and return correct results",
        );
        cy.findByTestId("query-visualization-root").should(
          "contain",
          "You'll need to pick a value for 'Unit' before this query can run.",
        );

        H.filterWidget().click();
        H.popover().findByText("Year").click();

        cy.findAllByTestId("run-button").first().click();

        cy.findByTestId("visualization-root").should(
          "contain",
          "January 1, 2022",
        );
      });

      it("should reset default value when time grouping options are changed", () => {
        const questionWithDefaultValue = {
          name: "Saved question with time grouping",
          native: {
            query:
              "SELECT count(*), {{unit}} as unit FROM ORDERS GROUP BY unit",
            "template-tags": {
              unit: {
                type: "temporal-unit",
                name: "unit",
                id: "eb345703-001c-4b2a-b7d5-71cb3efe4beb",
                "display-name": "Unit",
                dimension: ["field", ORDERS.CREATED_AT, null],
                required: true,
                default: "year",
              },
            },
          },
        };

        H.createNativeQuestion(questionWithDefaultValue).then(
          ({ body: { id } }) => {
            H.visitQuestion(id);
          },
        );

        cy.log("open editor");
        cy.findByTestId("visibility-toggler").click();
        cy.findByTestId("native-query-editor-container")
          .icon("variable")
          .click();

        H.rightSidebar().should("contain", "Variables and parameters");

        H.rightSidebar()
          .findByText("Default parameter widget value")
          .next()
          .should("contain", "Year");
        H.rightSidebar().findByText("Time grouping options").next().click();
        H.popover().findByText("Year").click();

        cy.log("verify default value is empty");
        H.rightSidebar().should("contain", "Enter a default value…");
      });

      it("should handle time grouping in optional clause", () => {
        const questionWithDefaultValue = {
          name: "Saved question with time grouping",
          native: {
            query: `
              SELECT
                ID [[,{{unit}} as unit]]
              FROM
                PEOPLE
              ORDER BY
                ID
              LIMIT
                10
            `,
            "template-tags": {
              unit: {
                type: "temporal-unit",
                name: "unit",
                id: "eb345703-001c-4b2a-b7d5-71cb3efe4beb",
                "display-name": "Unit",
                dimension: ["field", PEOPLE.CREATED_AT, null],
                default: "year",
              },
            },
          },
        };

        H.createNativeQuestion(questionWithDefaultValue, {
          visitQuestion: true,
        });

        cy.findByTestId("visualization-root")
          .should("contain", "January 1, 2022")
          .should("contain", "January 1, 2023");
      });

      it("should handle time grouping in optional clause without default value", () => {
        const questionWithDefaultValue = {
          name: "Saved question with time grouping",
          native: {
            query: `
              SELECT
                ID [[,{{unit}} as unit]]
              FROM
                PEOPLE
              WHERE
                1 = 1 [[AND ID = {{x}}]]
              ORDER BY
                ID
              LIMIT
                10
            `,
            "template-tags": {
              unit: {
                type: "temporal-unit",
                name: "unit",
                id: "eb345703-001c-4b2a-b7d5-71cb3efe4beb",
                dimension: ["field", PEOPLE.CREATED_AT, null],
                "display-name": "Unit",
              },
            },
          },
        };

        H.createNativeQuestion(questionWithDefaultValue, {
          visitQuestion: true,
        });

        cy.findByTestId("query-visualization-root")
          .should("not.contain", "October 7, 2023, 1:34 AM")
          .should("not.contain", "UNIT");
      });

      it("should show validation error when query is invalid", () => {
        H.startNewNativeQuestion();
        H.NativeEditor.type(
          "SELECT count(*), {{unit}} as unit FROM ORDERS GROUP BY unit",
        );
        setVariableType();
        H.queryBuilderHeader()
          .button("Save")
          .should("have.attr", "data-disabled");
      });
    });
  });

  it("can save a question with no rows", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from people where false");
    runQuery();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("No results!");
    cy.icon("contract").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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

    H.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This has a value");

    FILTERS.forEach((operator) => {
      cy.log("Apply a filter");
      H.filter();
      H.popover().findByText("V").click();
      H.selectFilterOperator(operator);
      H.popover().within(() => {
        cy.findByLabelText("Filter value").type("This has a value");
        cy.button("Apply filter").click();
      });

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

  it("should be able to add new columns after hiding some (metabase#15393)", () => {
    H.startNewNativeQuestion({ display: "table" });
    H.NativeEditor.type("select 1 as visible, 2 as hidden");
    cy.findByTestId("native-query-editor-container")
      .icon("play")
      .as("runQuery")
      .click();

    H.openVizSettingsSidebar();
    cy.findByTestId("sidebar-left")
      .as("sidebar")
      .within(() => {
        cy.findByTestId("draggable-item-HIDDEN")
          .icon("eye_outline")
          .click({ force: true });
      });
    H.NativeEditor.type("{movetoend}, 3 as added");
    cy.get("@runQuery").click();
    cy.get("@sidebar").contains(/added/i);
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Here's where your results will appear").should("be.visible");
  });

  it("should allow to preview a fully parameterized query", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from PRODUCTS where CATEGORY={{category}}");
    cy.findByPlaceholderText("Category").type("Gadget");
    cy.button("Preview the query").click();
    cy.wait("@datasetNative");

    H.modal().within(() => {
      H.codeMirrorValue().should("contain", "CATEGORY = 'Gadget'");
    });
  });

  it("should show errors when previewing a query", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from PRODUCTS where CATEGORY={{category}}");
    cy.button("Preview the query").click();
    cy.wait("@datasetNative");

    H.modal()
      .findByText(/missing required parameters/)
      .should("be.visible");
  });

  it("should run the query when pressing meta+enter", () => {
    H.startNewNativeQuestion({
      query: "SELECT COUNT(*) FROM ORDERS",
    });
    H.NativeEditor.focus();

    const isMac = Cypress.platform === "darwin";
    const metaKey = isMac ? "Meta" : "Control";
    cy.realPress([metaKey, "Enter"]);

    cy.wait("@dataset");

    cy.findByTestId("query-visualization-root").should("contain", "18,760");

    // make sure a new line was not inserted
    cy.get(".cm-lineNumbers").should("contain", "1").should("not.contain", "2");
  });

  it("should be possible to format the native query using the keyboard shortcut", () => {
    H.restore();
    cy.signInAsNormalUser();
    H.startNewNativeQuestion({
      query: "SELECT COUNT(*) FROM ORDERS",
    });
    H.NativeEditor.focus();

    const isMac = Cypress.platform === "darwin";
    const metaKey = isMac ? "Meta" : "Control";
    cy.realPress(["Shift", metaKey, "f"]);

    H.NativeEditor.value().should(
      "contain",
      "SELECT\n  COUNT(*)\nFROM\n  ORDERS",
    );
  });

  it("should add tab at the end of the query", () => {
    H.startNewNativeQuestion({
      query: "SELECT",
    });

    H.NativeEditor.focus();
    cy.realPress(["Tab"]);

    H.NativeEditor.get().should("have.text", "SELECT\t");
  });

  it("should indent the line when pressing tab while selected", () => {
    H.startNewNativeQuestion({
      query: "SELECT",
    });

    H.NativeEditor.focus().type("{selectall}");
    cy.realPress(["Tab"]);

    H.NativeEditor.get().should("have.text", "\tSELECT");
  });

  it("should indent the next line to the same level when entering newline", () => {
    H.startNewNativeQuestion();

    H.NativeEditor.focus()
      .type("{tab}SELECT{enter}FOO")
      .get()
      .should("have.text", "\tSELECT\tFOO");
  });

  it("should use the correct indentation for mongo", { tags: "@mongo" }, () => {
    const MONGO_DB_NAME = "QA Mongo";

    H.restore("mongo-5");
    cy.signInAsAdmin();

    H.startNewNativeQuestion();
    cy.findByTestId("gui-builder-data").click();
    cy.findByLabelText(MONGO_DB_NAME).click();

    H.NativeEditor.type('[{enter}{ {enter}"foo": "bar",{enter}"baz"');

    H.NativeEditor.get().should("be.visible").get(".cm-line").as("lines");

    cy.get("@lines").eq(0).should("have.text", "[");
    cy.get("@lines").eq(1).should("have.text", "  {");
    cy.get("@lines").eq(2).should("have.text", '    "foo": "bar",');
    cy.get("@lines").eq(3).should("have.text", '    "baz"');
    cy.get("@lines").eq(4).should("have.text", "  }");
    cy.get("@lines").eq(5).should("have.text", "]");
  });

  it(
    "it should insert a two spaces when pressing tab in json-like languages",
    { tags: "@mongo" },
    () => {
      const MONGO_DB_NAME = "QA Mongo";

      H.restore("mongo-5");
      cy.signInAsAdmin();

      H.startNewNativeQuestion();
      cy.findByTestId("gui-builder-data").click();
      cy.findByLabelText(MONGO_DB_NAME).click();

      H.NativeEditor.type("{tab}");

      H.NativeEditor.get().should("be.visible").get(".cm-line").as("lines");

      cy.get("@lines").eq(0).should("have.text", "  ");
    },
  );

  it("should be able to handle two sidebars on different screen sizes", () => {
    const questionDetails = {
      name: "13332",
      native: {
        query: "select * from PRODUCTS limit 5",
      },
    };

    function setViewport(width, height) {
      cy.viewport(width, height);
      cy.wait(100); // wait for UI to re-render to avoid flakiness
    }

    H.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.log("open editor on a normal screen size");
    cy.findByTestId("visibility-toggler").click();

    dataReferenceSidebar()
      .should("be.visible")
      // means data is loaded
      .should("contain", "Sample Database");

    cy.findByTestId("visibility-toggler").click();
    dataReferenceSidebar().should("not.be.visible");

    cy.log("open editor on a small screen size");
    setViewport(1279, 800);

    cy.log("try to open data reference sidebar on a mid size screen");
    cy.findByTestId("visibility-toggler").click();
    dataReferenceSidebar().should("not.be.visible");

    cy.log("open visualization settings sidebar, order matters");
    cy.findByTestId("viz-type-button").click();

    cy.log("open data reference sidebar");
    cy.findByTestId("native-query-editor-action-buttons")
      .icon("reference")
      .click();

    cy.log("set small viewport");
    setViewport(800, 800);

    cy.findByTestId("sidebar-left").invoke("width").should("be.gt", 350);
    cy.findByTestId("sidebar-right").invoke("width").should("be.gt", 350);
  });
});

// causes error in cypress 13
describe("no native access", { tags: ["@external", "@skip"] }, () => {
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

    H.createNativeQuestion(
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
    cy.get("@questionId").then((questionId) =>
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

      H.startNewNativeQuestion();
      cy.findByTestId("gui-builder-data").click();
      cy.findByLabelText(MONGO_DB_NAME).click();
      cy.findByLabelText("Auto-format").should("not.exist");

      cy.findByTestId("native-query-top-bar").findByText(MONGO_DB_NAME).click();

      // Switch to SQL engine which is supported by the formatter
      H.popover().findByText("Sample Database").click();

      H.NativeEditor.focus().type("select * from orders", {
        parseSpecialCharSequences: false,
      });

      // It should load the formatter chunk only when used
      cy.intercept("GET", "**/sql-formatter**").as("sqlFormatter");

      cy.findByLabelText("Auto-format").click();

      cy.wait("@sqlFormatter");

      H.NativeEditor.get().should("be.visible").get(".ace_line").as("lines");

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
    H.startNewNativeQuestion();
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
    H.createNativeQuestion(
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

    H.pickEntity({
      path: ["Bobby Tables's Personal Collection"],
      select: true,
    });

    H.startNewNativeQuestion();

    dataReferenceSidebar().within(() => {
      cy.findByText("2 models in 2 collections");
      cy.findByText("Bobby Tables's Personal Collection").click(); // collection
      cy.findByText("Native Products Model").click();
      cy.findByText("A model of the Products table"); // description
      cy.findByText("1 column");
      cy.findByText("RENAMED_ID").click();
      cy.findByText("No description");
    });
  });

  describe("metrics", () => {
    it("should not show metrics when they are not defined on the selected table", () => {
      H.startNewNativeQuestion();
      sidebarHeaderTitle().should("have.text", "Sample Database");

      dataReferenceSidebar().within(() => {
        cy.findByText("ORDERS").click();
        cy.findByText(/metric/).should("not.exist");
      });
    });

    it("should show metrics defined on tables", () => {
      H.createQuestion(ORDERS_SCALAR_METRIC);

      H.startNewNativeQuestion();
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
