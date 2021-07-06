import {
  restore,
  popover,
  modal,
  filterWidget,
  openNativeEditor,
} from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";
import { USER_GROUPS } from "__support__/e2e/cypress_data";

const { ORDERS, PRODUCTS } = SAMPLE_DATASET;
const { COLLECTION_GROUP } = USER_GROUPS;

describe("scenarios > question > native", () => {
  beforeEach(() => {
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

  it("clears a template tag's default when the type changes", () => {
    openNativeEditor()
      // Write a query with parameter x. It defaults to a text parameter.
      .type("select * from orders where total = {{x}}", {
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
    openNativeEditor().type("{{foo}} {{bar}}", {
      parseSpecialCharSequences: false,
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
    openNativeEditor()
      // start typing a question referenced
      .type("select * from {{#}}", {
        parseSpecialCharSequences: false,
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
    const QUESTION = "QQ";

    openNativeEditor().type(
      `SELECT null AS "V", 1 as "N" UNION ALL SELECT 'This has a value' AS "V", 2 as "N"`,
    );
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
      cy.findByText(QUESTION).click();
    });

    cy.url("should.contain", "/question#");
    cy.findByText("This has a value");

    FILTERS.forEach(filter => {
      // Clicking on a question's name in UI resets previously applied filters
      // We can ask variations of that question "on the fly"
      cy.findByText(QUESTION).click();

      cy.log("Apply a filter");
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

  it("should not make the question dirty when there are no changes (metabase#14302)", () => {
    cy.createNativeQuestion({
      name: "14302",
      native: {
        query:
          'SELECT "CATEGORY", COUNT(*)\nFROM "PRODUCTS"\nWHERE "PRICE" > {{PRICE}}\nGROUP BY "CATEGORY"',
        "template-tags": {
          PRICE: {
            id: "39b51ccd-47a7-9df6-a1c5-371918352c79",
            name: "PRICE",
            "display-name": "Price",
            type: "number",
            default: "10",
            required: true,
          },
        },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);
      cy.findByText("14302");
      cy.log("Reported on v0.37.5 - Regression since v0.37.0");
      cy.findByText("Save").should("not.exist");
    });
  });

  it("should reorder template tags by drag and drop (metabase#9357)", () => {
    openNativeEditor().type(
      "{{firstparameter}} {{nextparameter}} {{lastparameter}}",
      {
        parseSpecialCharSequences: false,
      },
    );

    // Drag the firstparameter to last position
    cy.get("fieldset .Icon-empty")
      .first()
      .trigger("mousedown", 0, 0, { force: true })
      .trigger("mousemove", 5, 5, { force: true })
      .trigger("mousemove", 430, 0, { force: true })
      .trigger("mouseup", 430, 0, { force: true });

    // Ensure they're in the right order
    cy.findAllByText("Variable name")
      .parent()
      .as("variableField");

    cy.get("@variableField")
      .first()
      .findByText("nextparameter");

    cy.get("@variableField")
      .last()
      .findByText("firstparameter");
  });

  ["nodata+nosql", "nosql"].forEach(test => {
    it.skip(`${test.toUpperCase()} version:\n should be able to view SQL question when accessing via dashboard with filters connected to modified card without SQL permissions (metabase#15163)`, () => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");

      cy.signInAsAdmin();
      cy.createNativeQuestion({
        name: "15163",
        native: {
          query: 'SELECT COUNT(*) FROM "PRODUCTS" WHERE {{cat}}',
          "template-tags": {
            cat: {
              id: "dd7f3e66-b659-7d1c-87b3-ab627317581c",
              name: "cat",
              "display-name": "Cat",
              type: "dimension",
              dimension: ["field-id", PRODUCTS.CATEGORY],
              "widget-type": "category",
              default: null,
            },
          },
        },
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.createDashboard("15163D").then(({ body: { id: DASHBOARD_ID } }) => {
          // Add filter to the dashboard
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
            parameters: [
              {
                name: "Category",
                slug: "category",
                id: "fd723065",
                type: "category",
              },
            ],
          });

          // Add previously created question to the dashboard
          cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cardId: QUESTION_ID,
          }).then(({ body: { id: DASH_CARD_ID } }) => {
            // Connect filter to that question
            cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
              cards: [
                {
                  id: DASH_CARD_ID,
                  card_id: QUESTION_ID,
                  row: 0,
                  col: 0,
                  sizeX: 10,
                  sizeY: 8,
                  series: [],
                  visualization_settings: {
                    "card.title": "New Title",
                  },
                  parameter_mappings: [
                    {
                      parameter_id: "fd723065",
                      card_id: QUESTION_ID,
                      target: ["dimension", ["template-tag", "cat"]],
                    },
                  ],
                },
              ],
            });
          });

          if (test === "nosql") {
            cy.updatePermissionsGraph({
              [COLLECTION_GROUP]: { "1": { schemas: "all", native: "none" } },
            });
          }

          cy.signIn("nodata");

          // Visit dashboard and set the filter through URL
          cy.visit(`/dashboard/${DASHBOARD_ID}?category=Gizmo`);
          cy.findByText("New Title").click();
          cy.wait("@dataset", { timeout: 5000 }).then(xhr => {
            expect(xhr.response.body.error).not.to.exist;
          });
          cy.get(".ace_content").should("not.exist");
          cy.findByText("Showing 1 row");
        });
      });
    });
  });

  it("should be able to add new columns after hiding some (metabase#15393)", () => {
    openNativeEditor().type("select 1 as visible, 2 as hidden");
    cy.get(".NativeQueryEditor .Icon-play")
      .as("runQuery")
      .click();
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
