const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue #55984", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should not overflow the suggestion tooltip when a suggestion name is too long, with or without spaces (metabase#55984)", () => {
    const longName =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt";
    const longNameWithoutSpaces = longName.replaceAll(" ", "_");

    H.addCustomColumn();
    H.enterCustomColumnDetails({ formula: "[Total]", name: longName });
    cy.button("Done").click();

    H.getNotebookStep("expression").icon("add").click();
    H.enterCustomColumnDetails({
      formula: "[Total]",
      name: longNameWithoutSpaces,
    });
    cy.button("Done").click();

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.CustomExpressionEditor.type("[lo");
    // The list scrolls vertically, so the second long suggestion can be out of view
    H.CustomExpressionEditor.completion(longName).should("exist");
    H.CustomExpressionEditor.completion(longNameWithoutSpaces).should("exist");
    H.CustomExpressionEditor.completions().should(($el) => {
      expect(H.isScrollableHorizontally($el[0])).to.be.false;
    });
  });
});

describe("issue 55622", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to mix regular functions with aggregation functions (metabase#55622)", () => {
    H.openPeopleTable({ mode: "notebook" });
    H.getNotebookStep("data").button("Summarize").click();
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({
      formula: 'datetimeDiff(Max([Created At]), max([Birth Date]), "minute")',
      name: "Aggregation",
    });
    H.popover().button("Done").click();
    H.visualize();
    H.assertQueryBuilderRowCount(1);
  });
});

describe("issue 55687", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should run is-empty and not-empty on stringly-typed expressions (metabase#55687)", () => {
    const title = ["field", PRODUCTS.TITLE, null];

    H.createQuestion(
      {
        query: {
          "source-table": PRODUCTS_ID,
          expressions: {
            "isEmpty - title": ["is-empty", title],
            "isEmpty - ltrim - title": ["is-empty", ["ltrim", title]],
            "isEmpty - literal": ["is-empty", "AAA"],
            "isEmpty - ltrim - literal": ["is-empty", ["ltrim", "AAA"]],
            "notEmpty - title": ["not-empty", title],
            "notEmpty - ltrim - title": ["not-empty", ["ltrim", title]],
            "notEmpty - literal": ["not-empty", "AAA"],
            "notEmpty - ltrim - literal": ["not-empty", ["ltrim", "AAA"]],
          },
          limit: 1,
        },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("query-visualization-root")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });
});

describe("Issue 12938", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openProductsTable({ mode: "notebook" });
  });

  it("should be possible to concat number with string (metabase#12938)", () => {
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().within(() => {
      // "Select all" on a fully selected list keeps only the first column (ID)
      cy.findByText("Select all").click();
      cy.findByText("Title").click();
      cy.findByText("ID").click();
    });
    cy.realPress("Escape");

    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: "concat(floor([Rating]), [Title])",
      name: "RatingTitle",
      clickDone: true,
    });

    H.getNotebookStep("expression").icon("add").click();
    H.enterCustomColumnDetails({
      formula: 'concat(hour([Created At]), ":", minute([Created At]))',
      name: "HourMinute",
      clickDone: true,
    });

    H.visualize(({ body }) => {
      expect(body.error).to.not.exist;
    });
    H.assertTableData({
      columns: ["Title", "RatingTitle", "HourMinute"],
      firstRows: [
        ["Rustic Paper Wallet", "4.0Rustic Paper Wallet", "19:44"],
        ["Small Marble Shoes", "0.0Small Marble Shoes", "8:49"],
      ],
    });
  });
});

describe("Issue 25189", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to use a custom column that just references a single column in filters in follow up question (metabase#25189)", () => {
    H.createQuestion({
      name: "Question with CCreated At",
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          "CCreated At": [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
            },
          ],
        },
      },
    }).then((res) => {
      H.createQuestion(
        {
          query: {
            "source-table": `card__${res.body.id}`,
          },
        },
        { visitQuestion: true },
      );
    });
    cy.findAllByTestId("header-cell")
      .contains("CCreated At")
      .should("be.visible");

    H.filter();
    H.popover().within(() => {
      cy.findAllByText("CCreated At").should("have.length", 1).first().click();
      cy.findByText("Today").click();
    });

    cy.wait("@dataset").its("response.body.error").should("not.exist");
    cy.findAllByTestId("filter-pill")
      .should("have.length", 1)
      .and("contain.text", "CCreated At");
    cy.findAllByTestId("header-cell")
      .contains("CCreated At")
      .should("be.visible");

    cy.get("main")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });

  it("should be possible to use a custom column that just references a single column in filters in follow up question, when the custom column has the same name as the column (metabase#25189)", () => {
    H.createQuestion({
      name: "Question with Created At",
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          "Created At": [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
            },
          ],
        },
      },
    }).then((res) => {
      H.createQuestion(
        {
          query: {
            "source-table": `card__${res.body.id}`,
          },
        },
        { visitQuestion: true },
      );
    });
    cy.findAllByTestId("header-cell")
      .contains("Created At")
      .should("be.visible");

    H.filter();
    H.popover().within(() => {
      cy.findAllByText("Created At").should("have.length", 2).first().click();
      cy.findByText("Today").click();
    });
    cy.wait("@dataset").its("response.body.error").should("not.exist");

    H.filter();
    H.popover().within(() => {
      cy.findAllByText("Created At").should("have.length", 2).last().click();
      cy.findByText("Today").click();
    });
    cy.wait("@dataset").its("response.body.error").should("not.exist");

    cy.findAllByTestId("filter-pill").should("have.length", 2);
    cy.findAllByTestId("header-cell")
      .contains("Created At")
      .should("be.visible");

    cy.get("main")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });
});

describe("issue 52451", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to use a custom expression in a join condition from the same stage in the LHS (metabase#52451)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      name: "Expr",
      formula: "[ID] * 1000",
    });
    H.popover().button("Done").click();
    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Reviews").click();
    });
    H.popover().findByText("Expr").click();
    H.popover().findByText("ID").click();
    H.getNotebookStep("join").findByLabelText("Change join type").click();
    H.popover().findByText("Inner join").click();
    H.visualize();
    H.assertQueryBuilderRowCount(1);
  });
});

describe("issue 56602", () => {
  const productsModelDetails = {
    name: "M1",
    type: "model",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const ordersModelDetails = {
    name: "M2",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
    },
  };

  const expressionName = "awesome stuff";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to use expressions when joining models (metabase#56602)", () => {
    H.createQuestion(productsModelDetails);
    H.createQuestion(ordersModelDetails);
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.realType(productsModelDetails.name);
      cy.findByText(productsModelDetails.name).click();
    });
    H.join();
    H.miniPicker().within(() => {
      cy.realType(ordersModelDetails.name);
      cy.findByText(ordersModelDetails.name).click();
    });
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      name: expressionName,
      formula: `coalesce([User -> Birth Date], [${ordersModelDetails.name} -> Created At])`,
    });
    H.popover().button("Done").click();
    H.visualize();
    H.tableInteractive().should("be.visible");
    H.tableInteractiveHeader().should("contain", expressionName);
  });
});
