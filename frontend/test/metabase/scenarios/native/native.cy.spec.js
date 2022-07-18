import {
  restore,
  popover,
  modal,
  openNativeEditor,
  visitQuestionAdhoc,
  summarize,
  sidebar,
  filter,
  filterField,
} from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

describe("scenarios > question > native", () => {
  beforeEach(() => {
    cy.intercept("POST", "api/dataset").as("dataset");
    cy.intercept("POST", "api/card").as("card");
    restore();
    cy.signInAsNormalUser();
  });

  it("lets you create and run a SQL question", () => {
    openNativeEditor().type("select count(*) from orders");
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("18,760");
  });

  it("displays an error", () => {
    openNativeEditor().type("select * from not_a_table");
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains('Table "NOT_A_TABLE" not found');
  });

  it("displays an error when running selected text", () => {
    openNativeEditor().type(
      "select * from orders" +
        "{leftarrow}".repeat(3) + // move left three
        "{shift}{leftarrow}".repeat(19), // highlight back to the front
    );
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains('Table "ORD" not found');
  });

  it("should show referenced cards in the template tag sidebar", () => {
    openNativeEditor()
      // start typing a question referenced
      .type("select * from {{#}}", {
        parseSpecialCharSequences: false,
      });

    cy.contains("Question #…")
      .parent()
      .parent()
      .contains("Pick a question or a model")
      .click({ force: true });

    // selecting a question should update the query
    popover().contains("Orders").click();

    cy.contains("select * from {{#1}}");

    // run query and see that a value from the results appears
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("37.65");

    // update the text of the query to reference question 2
    // :visible is needed because there is an unused .ace_content present in the DOM
    cy.get(".ace_content:visible").type("{leftarrow}{leftarrow}{backspace}2");

    // sidebar should show updated question title and name
    cy.contains("Question #2").parent().parent().contains("Orders, Count");

    // run query again and see new result
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("18,760");
  });

  it("should handle template tags", () => {
    openNativeEditor().type("select * from PRODUCTS where RATING > {{Stars}}", {
      parseSpecialCharSequences: false,
    });
    cy.get("input[placeholder*='Stars']").type("3");
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.wait("@dataset");
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
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.wait("@dataset");

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
    cy.get(".NativeQueryEditor .Icon-play").click();
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
      sidebar().within(() => {
        cy.icon("close").click();
      });
      cy.findByText("Done").click();
    });
  });

  it("should be able to add new columns after hiding some (metabase#15393)", () => {
    openNativeEditor().type("select 1 as visible, 2 as hidden");
    cy.get(".NativeQueryEditor .Icon-play").as("runQuery").click();
    cy.findByText("Settings").click();
    cy.findByTestId("sidebar-left")
      .as("sidebar")
      .contains(/hidden/i)
      .siblings(".Icon-close")
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

    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.wait("@dataset");

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

  it("should link correctly from the variables sidebar (metabase#16212)", () => {
    cy.createNativeQuestion({
      name: "test-question",
      native: { query: 'select 1 as "a", 2 as "b"' },
    }).then(({ body: { id: questionId } }) => {
      openNativeEditor().type(`{{#${questionId}}}`, {
        parseSpecialCharSequences: false,
      });
      cy.get(".NativeQueryEditor .Icon-play").click();
      cy.get(".Visualization").within(() => {
        cy.findByText("a");
        cy.findByText("b");
        cy.findByText("1");
        cy.findByText("2");
      });
      cy.findByRole("link", { name: `Question #${questionId}` })
        .should("have.attr", "href")
        .and("eq", `/question/${questionId}-test-question`);
    });
  });
});
