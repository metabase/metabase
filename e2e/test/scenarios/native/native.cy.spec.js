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
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
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
    cy.contains('Table "NOT_A_TABLE" not found');
  });

  it("displays an error when running selected text", () => {
    openNativeEditor().type(
      "select * from orders" +
        "{leftarrow}".repeat(3) + // move left three
        "{shift}{leftarrow}".repeat(19), // highlight back to the front
    );
    runQuery();
    cy.contains('Table "ORD" not found');
  });

  it("should handle template tags", () => {
    openNativeEditor().type("select * from PRODUCTS where RATING > {{Stars}}", {
      parseSpecialCharSequences: false,
    });
    cy.get("input[placeholder*='Stars']").type("3");
    runQuery();
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

    cy.findByText("Not now").click();
  });

  it("can save a question with no rows", () => {
    openNativeEditor().type("select * from people where false");
    runQuery();
    cy.contains("No results!");
    cy.icon("contract").click();
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

    cy.findByText(/where CATEGORY='Gadget'/).should("be.visible");
  });

  it("should show errors when previewing a query", () => {
    openNativeEditor().type(
      "select * from PRODUCTS where CATEGORY={{category}}",
      { parseSpecialCharSequences: false },
    );
    cy.button("Preview the query").click();
    cy.wait("@datasetNative");

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
    cy.findByText(/FROM "PUBLIC"."ORDERS"/).should("be.visible");

    cy.button("Convert this question to SQL").click();
    runQuery();
    cy.findByText("Showing 1 row").should("be.visible");
  });
});

const runQuery = () => {
  cy.get(".NativeQueryEditor .Icon-play").click();
  cy.wait("@dataset");
};
