import {
  signInAsNormalUser,
  signInAsAdmin,
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

  it("should let you create and use a snippet", () => {
    signInAsAdmin();
    cy.visit("/question/new");
    cy.contains("Native query").click();

    // type a query and highlight some of the text
    cy.get(".ace_content").as("ace");
    cy.get("@ace").type(
      "select 'stuff'" + "{shift}{leftarrow}".repeat("'stuff'".length),
    );

    // add a snippet of that text
    cy.get(".Icon-snippet").click();
    cy.contains("Create a snippet").click();
    modal()
      .find("input[name=name]")
      .type("stuff-snippet");
    modal()
      .contains("Save")
      .click();

    // SQL editor should get updated automatically
    cy.get("@ace").contains("select {{snippet: stuff-snippet}}");

    // run the query and check the displayed scalar
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.get(".ScalarValue").contains("stuff");
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
});
