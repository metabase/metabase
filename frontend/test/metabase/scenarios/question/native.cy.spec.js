import {
  restore,
  popover,
  modal,
  visitQuestionAdhoc,
  mockSessionProperty,
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
    cy.createNativeQuestion({
      name: "Test Question",
      native: {
        query: "select count(*) from orders where {{created_at}}",
        "template-tags": {
          created_at: {
            id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
            name: "created_at",
            "display-name": "Created at",
            type: "dimension",
            dimension: ["field", ORDERS.CREATED_AT, null],
            "widget-type": "date/month-year",
          },
        },
      },
      display: "scalar",
    }).then(response => {
      cy.visit(`/question/${response.body.id}?created_at=2020-01`);
      cy.contains("580");
    });
  });

  it("can save a question with no rows", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".ace_content").type("select * from people where false");
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

    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".ace_content")
      .should("be.visible")
      .type(
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
      cy.findByText("Robert Tableton's Personal Collection").click();
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

  it.skip("should not make the question dirty when there are no changes (metabase#14302)", () => {
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

  it.skip("should correctly display a revision state after a restore (metabase#12581)", () => {
    const ORIGINAL_QUERY = "SELECT * FROM ORDERS WHERE {{filter}} LIMIT 2";

    // Start with the original version of the question made with API
    cy.createNativeQuestion({
      name: "12581",
      native: {
        query: ORIGINAL_QUERY,
        "template-tags": {
          filter: {
            id: "a3b95feb-b6d2-33b6-660b-bb656f59b1d7",
            name: "filter",
            "display-name": "Filter",
            type: "dimension",
            dimension: ["field", ORDERS.CREATED_AT, null],
            "widget-type": "date/month-year",
            default: null,
          },
        },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);
    });
    cy.findByText(/Open Editor/i).click();
    cy.findByText(/Open Editor/i).should("not.exist");
    // Both delay and a repeated sequence of `{selectall}{backspace}` are there to prevent typing flakes
    // Without them at least 1 in 10 test runs locally didn't fully clear the field or type correctly
    cy.get(".ace_content")
      .click()
      .type("{selectall}{backspace}", { delay: 50 });
    cy.get(".ace_content")
      .click()
      .type("{selectall}{backspace}SELECT * FROM ORDERS");
    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByText("Save").click();
    });

    cy.reload();
    cy.icon("pencil").click();
    cy.findByText(/View revision history/i).click();
    cy.findByText(/Revert/i).click(); // Revert to the first revision
    cy.findByText(/Open Editor/i).click();

    cy.log("Reported failing on v0.35.3");
    cy.findByText(ORIGINAL_QUERY);
    // Filter dropdown field
    cy.get("fieldset").contains("Filter");
  });

  it("should reorder template tags by drag and drop (metabase#9357)", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();

    // Write a query with parameter firstparameter,nextparameter,lastparameter.
    cy.get(".ace_content").type(
      "{{firstparameter}} {{nextparameter}} {{lastparameter}}",
      {
        parseSpecialCharSequences: false,
        delay: 0,
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

  it.skip("field id should update when database source is changed (metabase#14145)", () => {
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");
    cy.signInAsAdmin();
    // Add another H2 sample dataset DB
    cy.request("POST", "/api/database", {
      engine: "h2",
      name: "Sample2",
      details: {
        db:
          "zip:./target/uberjar/metabase.jar!/sample-dataset.db;USER=GUEST;PASSWORD=guest",
      },
      auto_run_queries: true,
      is_full_sync: true,
      schedules: {},
    });

    cy.createNativeQuestion({
      name: "14145",
      native: {
        query: "SELECT COUNT(*) FROM PRODUCTS WHERE {{FILTER}}",
        "template-tags": {
          FILTER: {
            id: "774521fb-e03f-3df1-f2ae-e952c97035e3",
            name: "FILTER",
            "display-name": "Filter",
            type: "dimension",
            dimension: ["field-id", PRODUCTS.CATEGORY],
            "widget-type": "category",
            default: null,
          },
        },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);
    });
    // Change the source from "Sample Dataset" to the other database
    cy.findByText(/Open Editor/i).click();
    cy.get(".GuiBuilder-data")
      .as("source")
      .contains("Sample Dataset")
      .click();
    cy.findByText("Sample2").click();
    // First assert on the UI
    cy.icon("variable").click();
    cy.findByText(/Field to map to/)
      .siblings("a")
      .contains("Category");
    // Rerun the query and assert on the dimension (field-id) that didn't change
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.wait("@dataset").then(xhr => {
      const { dimension } = xhr.response.body.json_query.native[
        "template-tags"
      ].FILTER;
      expect(dimension).not.to.contain(PRODUCTS.CATEGORY);
    });
  });

  it("should be possible to use field filter on a query with joins where tables have similar columns (metabase#15460)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    visitQuestionAdhoc({
      name: "15460",
      dataset_query: {
        database: 1,
        native: {
          query:
            "select p.created_at, products.category\nfrom products\nleft join products p on p.id=products.id\nwhere {{category}}\n",
          "template-tags": {
            category: {
              id: "d98c3875-e0f1-9270-d36a-5b729eef938e",
              name: "category",
              "display-name": "Category",
              type: "dimension",
              dimension: ["field", PRODUCTS.CATEGORY, null],
              "widget-type": "category/=",
              default: null,
            },
          },
        },
        type: "native",
      },
    });

    // Set the filter value
    cy.get("fieldset")
      .contains("Category")
      .click();
    popover()
      .findByText("Doohickey")
      .click();
    cy.findByRole("button", { name: "Add filter" }).click();
    // Rerun the query
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.wait("@dataset").wait("@dataset");
    cy.get(".Visualization").within(() => {
      cy.findAllByText("Doohickey");
      cy.findAllByText("Gizmo").should("not.exist");
    });
  });

  it("should run with the default field filter set (metabase#15444)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.visit("/");
    cy.icon("sql").click();
    cy.get(".ace_content").type("select * from products where {{category}}", {
      parseSpecialCharSequences: false,
    });
    // Change filter type from "Text" to Field Filter
    cy.get(".AdminSelect")
      .contains("Text")
      .click();
    popover()
      .findByText("Field Filter")
      .click();
    popover()
      .findByText("Products")
      .click();
    popover()
      .findByText("Category")
      .click();
    cy.findByText("Required?").scrollIntoView();
    // Add the default value
    cy.findByText("Enter a default value...").click();
    popover()
      .findByText("Doohickey")
      .click();
    cy.findByRole("button", { name: "Add filter" }).click();
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).not.to.exist;
    });
    cy.get(".Visualization").within(() => {
      cy.findAllByText("Doohickey");
      cy.findAllByText("Gizmo").should("not.exist");
    });
  });

  ["old", "new"].forEach(test => {
    it(`${test} syntax:\n should be able to select category Field Filter in Native query (metabase#15700)`, () => {
      if (test === "old") {
        mockSessionProperty("field-filter-operators-enabled?", false);
      }
      const widgetType = test === "old" ? "Category" : "String";

      cy.visit("/");
      cy.icon("sql").click();
      cy.get(".ace_content").type("{{filter}}", {
        parseSpecialCharSequences: false,
      });
      cy.findByText("Variable type")
        .parent()
        .findByText("Text")
        .click();
      popover()
        .findByText("Field Filter")
        .click();
      popover().within(() => {
        cy.findByText("Sample Dataset");
        cy.findByText("Products").click();
      });
      popover()
        .findByText("Category")
        .click();
      cy.findByText("Filter widget type")
        .parent()
        .find(".AdminSelect")
        .findByText(widgetType)
        .click();
      popover()
        .find(".List-section")
        .should("have.length.gt", 1);
    });
  });
});
