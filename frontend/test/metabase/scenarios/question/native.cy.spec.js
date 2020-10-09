import {
  signInAsNormalUser,
  restore,
  popover,
  modal,
  withSampleDataset,
} from "__support__/cypress";

describe("scenarios > question > native", () => {
  before(restore);
  beforeEach(signInAsNormalUser);

  it("lets you create and run a SQL question", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".ace_content").type("select count(*) from orders");
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("18,760");
  });

  it("displays an error", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".ace_content").type("select * from not_a_table");
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains('Table "NOT_A_TABLE" not found');
  });

  it("displays an error when running selected text", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".ace_content").type(
      "select * from orders" +
      "{leftarrow}".repeat(3) + // move left three
        "{shift}{leftarrow}".repeat(19), // highlight back to the front
    );
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains('Table "ORD" not found');
  });

  it("clears a template tag's default when the type changes", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();

    // Write a query with parameter x. It defaults to a text parameter.
    cy.get(".ace_content").type("select * from orders where total = {{x}}", {
      parseSpecialCharSequences: false,
    });

    // Mark field as required and add a default text value.
    cy.contains("Required?")
      .next()
      .click();
    cy.contains("Default filter widget value")
      .next()
      .find("input")
      .type("some text");

    // Run the query and see an error.
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains(`Data conversion error converting "some text"`);

    // Oh wait! That doesn't match the total column, so we'll change the parameter to a number.
    cy.contains("Variable type")
      .next()
      .click();
    cy.contains("Number").click();

    // When we run it again, the default has been cleared out so we get the right error.
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains(
      "You'll need to pick a value for 'X' before this query can run.",
    );
  });

  it("doesn't reorder template tags when updated", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();

    // Write a query with parameter x. It defaults to a text parameter.
    cy.get(".ace_content").type("{{foo}} {{bar}}", {
      parseSpecialCharSequences: false,
      delay: 0,
    });

    cy.contains("Variables")
      .parent()
      .parent()
      .find(".text-brand")
      .as("variableLabels");

    // ensure they're in the right order to start
    cy.get("@variableLabels")
      .first()
      .should("have.text", "foo");
    cy.get("@variableLabels")
      .last()
      .should("have.text", "bar");

    // change the parameter to a number.
    cy.contains("Variable type")
      .first()
      .next()
      .as("variableType");
    cy.get("@variableType").click();
    cy.contains("Number").click();
    cy.get("@variableType").should("have.text", "Number");

    // ensure they're still in the right order
    cy.get("@variableLabels")
      .first()
      .should("have.text", "foo");
    cy.get("@variableLabels")
      .last()
      .should("have.text", "bar");
  });

  it("should show referenced cards in the template tag sidebar", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();

    // start typing a question referenced
    cy.get(".ace_content").type("select * from {{#}}", {
      parseSpecialCharSequences: false,
      delay: 0,
    });

    cy.contains("Question #…")
      .parent()
      .parent()
      .contains("Pick a saved question")
      .click({ force: true });

    // selecting a question should update the query
    popover()
      .contains("Orders")
      .click();

    cy.contains("select * from {{#1}}");

    // run query and see that a value from the results appears
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("37.65");

    // update the text of the query to reference question 2
    // :visible is needed because there is an unused .ace_content present in the DOM
    cy.get(".ace_content:visible").type("{leftarrow}{leftarrow}{backspace}2");

    // sidebar should show updated question title and name
    cy.contains("Question #2")
      .parent()
      .parent()
      .contains("Orders, Count");

    // run query again and see new result
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("18,760");
  });

  it("can load a question with a date filter (from issue metabase#12228)", () => {
    withSampleDataset(({ ORDERS }) => {
      cy.request("POST", "/api/card", {
        name: "Test Question",
        dataset_query: {
          type: "native",
          native: {
            query: "select count(*) from orders where {{created_at}}",
            "template-tags": {
              created_at: {
                id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
                name: "created_at",
                "display-name": "Created at",
                type: "dimension",
                dimension: ["field-id", ORDERS.CREATED_AT],
                "widget-type": "date/month-year",
              },
            },
          },
          database: 1,
        },
        display: "scalar",
        description: null,
        visualization_settings: {},
        collection_id: null,
        result_metadata: null,
        metadata_checksum: null,
      }).then(response => {
        cy.visit(`/question/${response.body.id}?created_at=2020-01`);
        cy.contains("580");
      });
    });
  });

  it("can save a question with no rows", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".ace_content").type("select * from people where false");
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("No results!");
    cy.get(".Icon-contract").click();
    cy.contains("Save").click();

    modal().within(() => {
      cy.findByLabelText("Name").type("empty question");
      cy.findByText("Save").click();
    });

    // confirm that the question saved and url updated
    cy.location("pathname").should("match", /\/question\/\d+/);
  });

  it.skip(`shouldn't remove rows containing NULL when using "Is not" or "Does not contain" filter (metabase#13332)`, () => {
    const FILTERS = ["Is not", "Does not contain"];
    const QUESTION = "QQ";

    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".ace_content")
      .should("be.visible")
      .type(`SELECT null AS "V" UNION ALL SELECT 'This has a value' AS "V"`);
    cy.findByText("Save").click();

    modal().within(() => {
      cy.findByLabelText("Name").type(QUESTION);
      cy.findByText("Save").click();
    });
    cy.findByText("Not now").click();

    cy.visit("/");
    cy.findByText("Ask a question").click();
    cy.findByText("Simple question").click();
    popover().within(() => {
      cy.findByText("Saved Questions").click();
      cy.findByText("Robert Tableton's Personal Collection").click();
      cy.findByText(QUESTION).click();
    });

    cy.url("should.contain", "/question#");
    cy.findByText("This has a value");

    FILTERS.forEach(filter => {
      // Clicking on a question's name in UI resets previously applied filters
      // We can ask variations of that question "on the fly"
      cy.findByText(QUESTION).click();

      cy.log("**Apply a filter**");
      cy.findAllByText("Filter")
        .first()
        .click();
      cy.get(".List-item-title")
        .contains("V")
        .click();
      cy.findByText("Is").click();
      popover().within(() => {
        cy.findByText(filter).click();
      });
      cy.findByPlaceholderText("Enter some text").type("This has a value");
      cy.findByText("Add filter").click();

      cy.log(
        `**Mid-point assertion for "${filter}" filter| FAILING in v0.36.6**`,
      );
      cy.findByText(`V ${filter.toLowerCase()} This has a value`);
      cy.findByText("No results!").should("not.exist");

      cy.log(
        "**Final assertion: Count of rows with 'null' value should be 1**",
      );
      // "Count" is pre-selected option for "Summarize"
      cy.findAllByText("Summarize")
        .first()
        .click();
      cy.findByText("Done").click();
      cy.get(".ScalarValue").contains("1");
    });
  });
});
