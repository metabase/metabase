import {
  restore,
  popover,
  _typeUsingGet,
  _typeUsingPlaceholder,
  openOrdersTable,
  openProductsTable,
  openPeopleTable,
  visitQuestionAdhoc,
} from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

const customFormulas = [
  {
    customFormula: "[Quantity] * 2",
    columnName: "Double Qt",
  },
  { customFormula: "[Quantity] * [Product.Price]", columnName: "Sum Total" },
];

describe("scenarios > question > custom columns", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("can create a custom column (metabase#13241)", () => {
    const columnName = "Simple Math";
    openOrdersTable({ mode: "notebook" });
    cy.icon("add_data").click();

    popover().within(() => {
      _typeUsingGet("[contenteditable='true']", "1 + 1", 400);
      _typeUsingPlaceholder("Something nice and descriptive", columnName);

      cy.findByText("Done").click();
    });

    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    cy.findByText("Visualize").click();
    cy.wait("@dataset");
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.get(".Visualization").contains(columnName);
  });

  it("can create a custom column with an existing column name", () => {
    customFormulas.forEach(({ customFormula, columnName }) => {
      openOrdersTable({ mode: "notebook" });
      cy.icon("add_data").click();

      popover().within(() => {
        _typeUsingGet("[contenteditable='true']", customFormula, 400);
        _typeUsingPlaceholder("Something nice and descriptive", columnName);

        cy.findByText("Done").click();
      });

      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");

      cy.findByText("Visualize").click();
      cy.wait("@dataset");
      cy.get(".Visualization").contains(columnName);
    });
  });

  it("should create custom column with fields from aggregated data (metabase#12762)", () => {
    openOrdersTable({ mode: "notebook" });

    cy.findByText("Summarize").click();

    popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Subtotal").click();
    });

    // TODO: There isn't a single unique parent that can be used to scope this icon within
    // (a good candidate would be `.NotebookCell`)
    cy.icon("add")
      .last() // This is brittle.
      .click();

    popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });

    cy.findByText("Pick a column to group by").click();
    cy.findByText("Created At").click();

    // Add custom column based on previous aggregates
    const columnName = "MegaTotal";
    cy.findByText("Custom column").click();
    popover().within(() => {
      cy.get("[contenteditable='true']")
        .click()
        .type("[Sum of Subtotal] + [Sum of Total]");
      cy.findByPlaceholderText("Something nice and descriptive")
        .click()
        .type(columnName);
      cy.findByText("Done").click();
    });

    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    cy.findByText("Visualize").click();
    cy.wait("@dataset");
    cy.findByText("There was a problem with your question").should("not.exist");
    // This is a pre-save state of the question but the column name should appear
    // both in tabular and graph views (regardless of which one is currently selected)
    cy.get(".Visualization").contains(columnName);
  });

  it.skip("should allow 'zoom in' drill-through when grouped by custom column (metabase#13289)", () => {
    const columnName = "TestColumn";
    openOrdersTable({ mode: "notebook" });

    // Add custom column that will be used later in summarize (group by)
    cy.findByText("Custom column").click();
    popover().within(() => {
      _typeUsingGet("[contenteditable='true']", "1 + 1", 400);
      _typeUsingPlaceholder("Something nice and descriptive", columnName);

      cy.findByText("Done").click();
    });

    cy.findByText("Summarize").click();
    popover().within(() => {
      cy.findByText("Count of rows").click();
    });

    cy.findByText("Pick a column to group by").click();
    popover().within(() => {
      cy.findByText(columnName).click();
    });

    cy.icon("add")
      .last()
      .click();

    popover().within(() => {
      cy.findByText("Created At").click();
    });

    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    cy.findByText("Visualize").click();
    cy.wait("@dataset");

    cy.get(".Visualization").within(() => {
      cy.get("circle")
        .eq(5) // random circle in the graph (there is no specific reason for this index)
        .click({ force: true });
    });

    // Test should work even without this request, but it reduces a chance for a flake
    cy.route("POST", "/api/dataset").as("zoom-in-dataset");

    cy.findByText("Zoom in").click();
    cy.wait("@zoom-in-dataset");

    cy.findByText("There was a problem with your question").should("not.exist");
  });

  it("should not return same results for columns with the same name (metabase#12649)", () => {
    openOrdersTable({ mode: "notebook" });
    // join with Products
    cy.findByText("Join data").click();
    cy.findByText("Products").click();

    // add custom column
    cy.findByText("Custom column").click();
    popover().within(() => {
      // Double click at the end of this command is just an ugly hack that seems to reduce the flakiness of this test a lot!
      // TODO: investigate contenteditable element - it is losing input value and I could reproduce it even locally (outside of Cypress)
      cy.get("[contenteditable='true']")
        .type("1+1")
        .click()
        .click();
      cy.findByPlaceholderText("Something nice and descriptive").type("X");

      cy.findByText("Done").click();
    });

    cy.findByText("Visualize").click();

    // wait for results to load
    cy.get(".LoadingSpinner").should("not.exist");
    cy.findByText("Visualize").should("not.exist");

    cy.log(
      "**Fails in 0.35.0, 0.35.1, 0.35.2, 0.35.4 and the latest master (2020-10-21)**",
    );
    cy.log("Works in 0.35.3");
    // ID should be "1" but it is picking the product ID and is showing "14"
    cy.get(".TableInteractive-cellWrapper--firstColumn")
      .eq(1) // the second cell from the top in the first column (the first one is a header cell)
      .within(() => {
        cy.findByText("1");
      });
  });

  it.skip("should be able to use custom expression after aggregation (metabase#13857)", () => {
    const CE_NAME = "13857_CE";
    const CC_NAME = "13857_CC";

    cy.signInAsAdmin();

    cy.createQuestion({
      name: "13857",
      query: {
        expressions: {
          [CC_NAME]: ["*", ["field-literal", CE_NAME, "type/Float"], 1234],
        },
        "source-query": {
          aggregation: [
            ["aggregation-options", ["*", 1, 1], { "display-name": CE_NAME }],
          ],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
          ],
          "source-table": ORDERS_ID,
        },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.server();
      cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

      cy.visit(`/question/${QUESTION_ID}`);

      cy.log("Reported failing v0.34.3 through v0.37.2");
      cy.wait("@cardQuery").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });

      cy.findByText(CC_NAME);
    });
  });

  it("should work with implicit joins (metabase#14080)", () => {
    const CC_NAME = "OneisOne";
    cy.signInAsAdmin();

    cy.createQuestion({
      name: "14080",
      query: {
        "source-table": ORDERS_ID,
        expressions: { [CC_NAME]: ["*", 1, 1] },
        aggregation: [
          [
            "distinct",
            [
              "fk->",
              ["field-id", ORDERS.PRODUCT_ID],
              ["field-id", PRODUCTS.ID],
            ],
          ],
          ["sum", ["expression", CC_NAME]],
        ],
        breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"]],
      },
      display: "line",
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.server();
      cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

      cy.visit(`/question/${QUESTION_ID}`);

      cy.log("Regression since v0.37.1 - it works on v0.37.0");
      cy.wait("@cardQuery").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });

      cy.contains(`Sum of ${CC_NAME}`);
      cy.get(".Visualization .dot").should("have.length.of.at.least", 8);
    });
  });

  it.skip("should create custom column after aggregation with 'cum-sum/count' (metabase#13634)", () => {
    cy.createQuestion({
      name: "13634",
      query: {
        expressions: { "Foo Bar": ["+", 57910, 1] },
        "source-query": {
          aggregation: [["cum-count"]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
          ],
          "source-table": ORDERS_ID,
        },
      },
    }).then(({ body: { id: questionId } }) => {
      cy.visit(`/question/${questionId}`);
      cy.findByText("13634");

      cy.log("Reported failing in v0.34.3, v0.35.4, v0.36.8.2, v0.37.0.2");
      cy.findByText("Foo Bar");
      cy.findAllByText("57911");
    });
  });

  it.skip("should not be dropped if filter is changed after aggregation (metaabase#14193)", () => {
    const CC_NAME = "Double the fun";

    cy.createQuestion({
      name: "14193",
      query: {
        "source-query": {
          "source-table": ORDERS_ID,
          filter: [">", ["field-id", ORDERS.SUBTOTAL], 0],
          aggregation: [["sum", ["field-id", ORDERS.TOTAL]]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"],
          ],
        },
        expressions: {
          [CC_NAME]: ["*", ["field-literal", "sum", "type/Float"], 2],
        },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);

      // Test displays collapsed filter - click on number 1 to expand and show the filter name
      cy.icon("filter")
        .parent()
        .contains("1")
        .click();

      cy.findByText(/Subtotal is greater than 0/i)
        .parent()
        .find(".Icon-close")
        .click();

      cy.findByText(CC_NAME);
    });
  });

  it.skip("should handle identical custom column and table column names (metabase#14255)", () => {
    // Uppercase is important for this reproduction on H2
    const CC_NAME = "CATEGORY";

    cy.createQuestion({
      name: "14255",
      query: {
        "source-table": PRODUCTS_ID,
        expressions: {
          [CC_NAME]: ["concat", ["field-id", PRODUCTS.CATEGORY], "2"],
        },
        aggregation: [["count"]],
        breakout: [["expression", CC_NAME]],
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);

      cy.findByText(CC_NAME);
      cy.findByText("Gizmo2");
    });
  });

  it.skip("should drop custom column (based on a joined field) when a join is removed (metabase#14775)", () => {
    const CE_NAME = "Rounded price";

    cy.createQuestion({
      name: "14775",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", ORDERS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
        expressions: {
          [CE_NAME]: [
            "ceil",
            ["joined-field", "Products", ["field-id", PRODUCTS.PRICE]],
          ],
        },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");

      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });

    // Remove join
    cy.findByText("Join data")
      .parent()
      .find(".Icon-close")
      .click({ force: true }); // x is hidden and hover doesn't work so we have to force it
    cy.findByText("Join data").should("not.exist");

    cy.log("Reported failing on 0.38.1-SNAPSHOT (6d77f099)");
    cy.get("[class*=NotebookCellItem]")
      .contains(CE_NAME)
      .should("not.exist");
    cy.findByText("Visualize").click();

    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).to.not.exist;
    });
    cy.contains("37.65");
  });

  describe("data type", () => {
    it("should understand string functions", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      popover().within(() => {
        cy.get("[contenteditable='true']")
          .type("concat([Category], [Title])")
          .blur();
        cy.findByPlaceholderText("Something nice and descriptive").type(
          "CategoryTitle",
        );
        cy.findByRole("button", { name: "Done" }).click();
      });
      cy.findByText("Filter").click();
      popover()
        .findByText("CategoryTitle")
        .click();
      cy.findByPlaceholderText("Enter a number").should("not.exist");
      cy.findByPlaceholderText("Enter some text");
    });

    it("should relay the type of a date field", () => {
      openPeopleTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      popover().within(() => {
        _typeUsingGet("[contenteditable='true']", "[Birth Date]", 400);
        _typeUsingPlaceholder("Something nice and descriptive", "DoB");
        cy.findByText("Done").click();
      });
      cy.findByText("Filter").click();
      popover()
        .findByText("DoB")
        .click();
      cy.findByPlaceholderText("Enter a number").should("not.exist");
      cy.findByText("Previous");
      cy.findByText("Days");
    });
  });

  it("should handle using `case()` when referencing the same column names (metabase#14854)", () => {
    const CC_NAME = "CE with case";

    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            [CC_NAME]: [
              "case",
              [
                [
                  [">", ["field", ORDERS.DISCOUNT, null], 0],
                  ["field", ORDERS.CREATED_AT, null],
                ],
              ],
              {
                default: [
                  "field",
                  PRODUCTS.CREATED_AT,
                  { "source-field": ORDERS.PRODUCT_ID },
                ],
              },
            ],
          },
        },
        database: 1,
      },
      display: "table",
    });

    cy.wait("@dataset").should(xhr => {
      expect(xhr.response.body.error).not.to.exist;
    });

    cy.findByText(CC_NAME);
    cy.contains("37.65");
  });

  it.skip("should handle brackets in the name of the custom column (metabase#15316)", () => {
    cy.createQuestion({
      name: "15316",
      query: {
        "source-table": ORDERS_ID,
        expressions: { "MyCC [2021]": ["+", 1, 1] },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });
    cy.findByText("Summarize").click();
    cy.findByText("Sum of ...").click();
    popover()
      .findByText("MyCC [2021]")
      .click();
    cy.get("[class*=NotebookCellItem]")
      .contains("Sum of MyCC [2021]")
      .click();
    popover().within(() => {
      cy.icon("chevronleft").click();
      cy.findByText("Custom Expression").click();
    });
    cy.get("[contenteditable='true']").contains("Sum([MyCC [2021]])");
  });
});
