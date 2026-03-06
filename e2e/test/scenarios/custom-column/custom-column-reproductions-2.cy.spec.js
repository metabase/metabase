const { H } = cy;
import { dedent } from "ts-dedent";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 54638", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();
  });

  it("should be possible to click documentation links in the expression editor help text popover (metabase#54638)", () => {
    H.CustomExpressionEditor.type("case(");
    H.CustomExpressionEditor.helpText().within(() => {
      cy.findByText("Learn more")
        .scrollIntoView()
        .should("be.visible")
        .then(($a) => {
          expect($a).to.have.attr("target", "_blank");
          // Update attr to open in same tab, since Cypress does not support
          // testing in multiple tabs.
          $a.attr("target", "_self");
        })
        .click();
      cy.url().should(
        "equal",
        "https://www.metabase.com/docs/latest/questions/query-builder/expressions/case.html",
      );
    });
  });
});

describe("issue #54722", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should focus the editor when opening it (metabase#54722)", () => {
    H.addCustomColumn();
    cy.focused().should("have.attr", "role", "textbox");
    H.expressionEditorWidget().button("Cancel").click();

    H.filter({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    cy.focused().should("have.attr", "role", "textbox");
    H.expressionEditorWidget().button("Cancel").click();

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    cy.focused().should("have.attr", "role", "textbox");
    H.expressionEditorWidget().button("Cancel").click();
  });
});

describe("issue #31964", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should focus the editor when opening it (metabase#54722)", () => {
    H.addCustomColumn();
    H.CustomExpressionEditor.type('case([Product -> Category] = "Widget", 1,');
    cy.realPress("Enter");
    H.CustomExpressionEditor.type("[Product -> Categ", { focus: false });
    cy.realPress("Tab");
    H.CustomExpressionEditor.value().should(
      "equal",
      dedent`
        case([Product → Category] = "Widget", 1,
        [Product → Category])
      `,
    );
  });
});

describe("issue #55686", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should show suggestions for functions even when the current token is an operator (metabase#55686)", () => {
    H.addCustomColumn();
    H.CustomExpressionEditor.type("not");

    H.CustomExpressionEditor.completion("notNull").should("be.visible");
    H.CustomExpressionEditor.completion("notEmpty").should("be.visible");
  });
});

describe("issue #55940", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should show the correct example for Offset (metabase#55940)", () => {
    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();

    H.CustomExpressionEditor.type("Offset(");
    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "Offset(Sum([Total]), -1)");
  });
});

describe("issue #55984", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should not overflow the suggestion tooltip when a suggestion name is too long (metabase#55984)", () => {
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: "[Total]",
      name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt",
    });
    cy.button("Done").click();

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.CustomExpressionEditor.type("[lo");
    H.CustomExpressionEditor.completions().should(($el) => {
      expect(H.isScrollableHorizontally($el[0])).to.be.false;
    });
  });

  it("should not overflow the suggestion tooltip when a suggestion name is too long and has no spaces (metabase#55984)", () => {
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: "[Total]",
      name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt".replaceAll(
        " ",
        "_",
      ),
    });
    cy.button("Done").click();

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.CustomExpressionEditor.type("[lo");
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

describe("issue 56152", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("Should show the help text popover when typing a multi-line expression (metabase#56152)", () => {
    H.openPeopleTable({ mode: "notebook" });
    H.addCustomColumn();
    H.CustomExpressionEditor.type(dedent`
      datetimeDiff(
        [Created At],
    `);

    H.CustomExpressionEditor.helpText().should("be.visible");
  });
});

describe("issue 56596", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    const questionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        fields: [["field", PRODUCTS.ID, null]],
        limit: 1,
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.openNotebook();
  });

  it("should not remove backslashes from escaped characters (metabase#56596)", () => {
    H.addCustomColumn();
    const expr = dedent`
      regexExtract([Vendor], "\\s.*")
    `;
    H.enterCustomColumnDetails({
      formula: expr,
      name: "Last name",
    });
    H.CustomExpressionEditor.format();
    H.CustomExpressionEditor.value().should("equal", expr);
    H.expressionEditorWidget().button("Done").click();

    H.getNotebookStep("expression").findByText("Last name").click();
    H.CustomExpressionEditor.value().should("equal", expr);
    H.expressionEditorWidget().button("Cancel").click();

    H.visualize();
    H.assertTableData({
      columns: ["ID", "Last name"],
      firstRows: [["1", " Casper and Hilll"]],
    });
  });
});

describe("issue 55300", () => {
  describe("fields", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsNormalUser();

      const questionDetails = {
        query: {
          "source-table": PRODUCTS_ID,
          fields: [["field", PRODUCTS.ID, null]],
          expressions: {
            now: ["field", PRODUCTS.CREATED_AT, null],
            Count: ["+", 1, 1],
          },
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });
      H.openNotebook();
    });

    it("should be possible to disambiguate between fields and no-argument functions (metabase#55300)", () => {
      H.getNotebookStep("expression").icon("add").click();
      H.CustomExpressionEditor.type("now() > now");

      cy.log("Move cursor over now");
      H.CustomExpressionEditor.type("{leftarrow}");
      H.CustomExpressionEditor.helpTextHeader().should("not.exist");

      cy.log("Move cursor over now()");
      H.CustomExpressionEditor.type("{home}");
      H.CustomExpressionEditor.helpTextHeader().should("contain", "now()");

      H.CustomExpressionEditor.format();
      H.CustomExpressionEditor.value().should("equal", "now() > [now]");
    });

    it("should be possible to disambiguate between fields and no-argument aggregations (metabase#55300)", () => {
      H.summarize({ mode: "notebook" });
      H.popover().findByText("Custom Expression").click();

      H.CustomExpressionEditor.type("Count() + Sum(Count)");

      cy.log("Move cursor over Count");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(2));
      H.CustomExpressionEditor.helpTextHeader().should("contain", "Sum");

      cy.log("Move cursor over Count()");
      H.CustomExpressionEditor.type("{home}");
      H.CustomExpressionEditor.helpTextHeader().should("contain", "Count()");

      H.CustomExpressionEditor.format();
      H.CustomExpressionEditor.value().should(
        "equal",
        "Count() + Sum([Count])",
      );
    });
  });

  describe("segments", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      H.createSegment({
        name: "now",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      H.createSegment({
        name: "Count",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      const questionDetails = {
        query: {
          "source-table": ORDERS_ID,
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });
      H.openNotebook();
    });

    it("should be possible to disambiguate between segments and no-argument functions (metabase#55300)", () => {
      H.addCustomColumn();

      H.CustomExpressionEditor.type("case(now, now(), [Created At])");

      cy.log("Move cursor over now()");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(17));
      H.CustomExpressionEditor.helpTextHeader().should("contain", "now()");

      cy.log("Move cursor over now");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(7), { focus: false });
      H.CustomExpressionEditor.helpTextHeader().should("contain", "case");

      H.CustomExpressionEditor.format();
      H.CustomExpressionEditor.value().should(
        "equal",
        "case([now], now(), [Created At])",
      );
    });

    it("should be possible to disambiguate between segments and no-argument aggregations (metabase#55300)", () => {
      H.summarize({ mode: "notebook" });
      H.popover().findByText("Custom Expression").click();

      H.CustomExpressionEditor.type("Sum(case(Count, Count(), 0))");

      cy.log("Move cursor over now()");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(7));
      H.CustomExpressionEditor.helpTextHeader().should("contain", "Count()");

      cy.log("Move cursor over now");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(18));
      H.CustomExpressionEditor.helpTextHeader().should("contain", "case");

      H.CustomExpressionEditor.format();
      H.CustomExpressionEditor.value().should(
        "equal",
        "Sum(case([Count], Count(), 0))",
      );
    });
  });

  describe("metrics", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      H.createQuestion({
        name: "Count",
        type: "metric",
        description: "A metric",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      });

      const questionDetails = {
        query: {
          "source-table": ORDERS_ID,
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });
      H.openNotebook();
    });

    it("should be possible to disambiguate between metrics and no-argument aggregations (metabase#55300)", () => {
      H.summarize({ mode: "notebook" });
      H.popover().findByText("Custom Expression").click();

      H.CustomExpressionEditor.type("Count + Count()");

      cy.log("Move cursor over Count()");
      H.CustomExpressionEditor.type("{leftarrow}".repeat(5));
      H.CustomExpressionEditor.helpTextHeader().should("contain", "Count()");

      cy.log("Move cursor over Count");
      H.CustomExpressionEditor.type("{home}");
      H.CustomExpressionEditor.helpTextHeader().should("not.exist");

      H.CustomExpressionEditor.format();
      H.CustomExpressionEditor.value().should("equal", "[Count] + Count()");
    });
  });
});

describe("issue 55687", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    const questionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        limit: 1,
      },
    };

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.openNotebook();
  });

  function addExpression(name, expression) {
    H.getNotebookStep("expression").icon("add").click();
    H.enterCustomColumnDetails({
      formula: expression,
      name,
    });
    H.popover().button("Done").click();
  }

  it("should allow passing stringly-typed expressions to is-empty and not-empty (metabase#55687)", () => {
    H.addCustomColumn();
    H.popover().button("Cancel").click();

    addExpression("isEmpty - title", "isEmpty([Title])");
    addExpression("isEmpty - ltrim - title", "isEmpty(lTrim([Title]))");
    addExpression("isEmpty - literal", "isEmpty('AAA')");
    addExpression("isEmpty - ltrim - literal", "isEmpty(lTrim('AAA'))");

    addExpression("notEmpty - title", "notEmpty([Title])");
    addExpression("notEmpty - ltrim - title", "notEmpty(lTrim([Title]))");
    addExpression("notEmpty - literal", "notEmpty('AAA')");
    addExpression("notEmpty - ltrim - literal", "notEmpty(lTrim('AAA'))");

    H.visualize();

    cy.findByTestId("query-visualization-root")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });
});

describe("issue 58371", { tags: "@skip" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      display_name: null,
    });

    const baseQuestion = {
      name: "Base Question",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [
          [
            "aggregation-options",
            ["count-where", ["=", ["field", PRODUCTS.TITLE, null], "OK"]],
            { "display-name": "Aggregation with Dash-in-name" },
          ],
        ],
        breakout: [["field", PRODUCTS.ID, null]],
      },
    };

    H.createQuestion(baseQuestion, { wrapId: true }).then((questionId) => {
      const questionDetails = {
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              "source-table": `card__${questionId}`,
              alias: "Other Question",
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Other Question" }],
              ],
            },
          ],
          expressions: {
            Foo: [
              "+",
              0,
              [
                "field",
                "count_where",
                {
                  "base-type": "type/Float",
                  "join-alias": "Other Question",
                },
              ],
            ],
          },
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });
    });

    H.openNotebook();
  });

  it("should allow using names with a dash in them from joined tables (metabase#58371)", () => {
    H.getNotebookStep("expression").findByText("Foo").click();
    H.CustomExpressionEditor.value().should(
      "eq",
      "0 + [Other Question → Aggregation with Dash-in-name]",
    );
  });
});

describe("Issue 58230", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should display an error when using an aggregation function in a custom column (metabase#58230)", () => {
    H.getNotebookStep("data").button("Custom column").click();
    H.CustomExpressionEditor.type("Average([Total])");
    H.popover().findByText(
      "Aggregations like Average are not allowed when building a custom expression",
    );
  });

  it("should display an error when using an aggregation function in a custom filter (metabase#58230)", () => {
    H.filter({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.CustomExpressionEditor.type("Average([Total])");
    H.popover().findByText(
      "Aggregations like Average are not allowed when building a custom filter",
    );
  });

  it("should not display an error when using an aggregation function in a custom aggregation (metabase#58230)", () => {
    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.CustomExpressionEditor.type("Average([Total])");
    H.CustomExpressionEditor.nameInput().type("Foo");
    H.popover().button("Done").should("be.enabled");
  });
});

describe("issue 57674", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  // TODO: re-enable this test once we have a fix for metabase#61264
  it(
    "should show an error when using a case or if expression with mismatched types (metabase#57674)",
    { tags: "@skip" },
    () => {
      H.getNotebookStep("data").button("Custom column").click();

      H.CustomExpressionEditor.clear();
      H.popover().findByText("Types are incompatible.").should("not.exist");

      H.CustomExpressionEditor.type(
        'case([Total] > 100, [Created At], "foo")',
        {
          allowFastSet: true,
        },
      ).blur();

      H.popover().findByText("Types are incompatible.").should("be.visible");
    },
  );

  it("should not show an error when using a case or if expression with compatible types (metabase#57674)", () => {
    H.getNotebookStep("data").button("Custom column").click();

    H.CustomExpressionEditor.clear();
    H.popover().findByText("Types are incompatible.").should("not.exist");

    H.CustomExpressionEditor.type('case([Total] > 100, "foo", "bar")', {
      allowFastSet: true,
    }).blur();

    H.popover().findByText("Types are incompatible.").should("not.exist");
  });
});

describe("Issue 12938", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openProductsTable({ mode: "notebook" });
  });

  it("should be possible to concat number with string (metabase#12938)", () => {
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: "concat(floor([Rating]), [Title])",
      name: "MyCustom",
      clickDone: true,
    });

    H.visualize();
    cy.get("main")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });

  it("should be possible to concat number with string (metabase#12938)", () => {
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: 'concat(hour([Created At]), ":", minute([Created At]))',
      name: "MyCustom",
      clickDone: true,
    });

    H.visualize();
    cy.get("main")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });
});

describe("Issue 25189", () => {
  beforeEach(() => {
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

    H.filter();
    H.popover().within(() => {
      cy.findAllByText("Created At").should("have.length", 2).last().click();
      cy.findByText("Today").click();
    });

    cy.findAllByTestId("header-cell")
      .contains("Created At")
      .should("be.visible");

    cy.get("main")
      .findByText("There was a problem with your question")
      .should("not.exist");
  });
});

describe("Issue 26512", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.openOrdersTable({ mode: "notebook" });
  });

  const TEST_CASES = [
    'year("a string")',
    'month("a string")',
    'day("a string")',
    'hour("a string")',
    'minute("a string")',
    'datetimeAdd("a string", 1, "day")',
    'datetimeDiff("a string", 1, "day")',
    "year(1)",
    "month(42)",
    "day(102)",
    "hour(140)",
    "minute(55)",
    'datetimeAdd(42, 1, "day")',
    'datetimeDiff(42, 1, "day")',
    "year(true)",
    "month(true)",
    "day(true)",
    "hour(true)",
    "minute(true)",
    'datetimeAdd(true, 1, "day")',
    'datetimeDiff(true, 1, "day")',
  ];

  it("should validate types for date/time functions (metabase#26512)", () => {
    H.addCustomColumn();

    TEST_CASES.forEach((formula) => {
      H.CustomExpressionEditor.clear()
        .type(formula, { allowFastSet: true })
        .blur();
      H.popover().findByText("Types are incompatible.").should("be.visible");
    });
  });
});

describe("Issue 38498", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();

    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
    });
  });

  it("should not be possible to use convertTimezone with an invalid timezone (metabse#38498)", () => {
    H.addCustomColumn();
    H.CustomExpressionEditor.type(
      'convertTimezone([Created At], "Asia/Ho_Chi_Mihn", "UTC")',
    );
    H.popover().findByText("Types are incompatible.").should("be.visible");
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

describe("issue 61010", () => {
  const CUSTOM_COLUMN_NAME = "Foo";
  const AGGREGATION_NAME = "New count";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            [CUSTOM_COLUMN_NAME]: ["+", 1, 2],
          },
          aggregation: [
            [
              "aggregation-options",
              ["+", ["count"], 1],
              {
                name: AGGREGATION_NAME,
                "display-name": AGGREGATION_NAME,
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );

    H.openNotebook();
  });

  it("should not be possible to reference a custom expression in itself (metabase#61010)", () => {
    H.getNotebookStep("expression").findByText(CUSTOM_COLUMN_NAME).click();
    H.CustomExpressionEditor.clear().type("[Fo");
    H.CustomExpressionEditor.completions()
      .findByText("Foo")
      .should("not.exist");

    H.CustomExpressionEditor.clear().type("[Foo]");
    H.popover().findByText("Unknown column: Foo").should("be.visible");
  });

  it("should not be possible to reference an aggregation in itself(metabase#61010)", () => {
    H.getNotebookStep("summarize").findByText(AGGREGATION_NAME).click();
    H.CustomExpressionEditor.clear().type("[New cou");
    H.CustomExpressionEditor.completions()
      .findByText("New count")
      .should("not.exist");

    H.CustomExpressionEditor.clear().type("[New count]");
    H.popover()
      .findByText("Unknown Aggregation, Measure or Metric: New count")
      .should("be.visible");
  });
});

describe("issue 62987", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        query: { "source-table": ORDERS_ID },
      },
      { visitQuestion: true },
    );

    H.openNotebook();
    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
  });

  it("should be possible to complete non-aggregation functions in custom aggregation (metabase#62987)", () => {
    H.CustomExpressionEditor.type("Coun");
    H.CustomExpressionEditor.completion("CountIf").should("be.visible").click();

    H.CustomExpressionEditor.type("notEm", { focus: false });
    H.CustomExpressionEditor.completion("notEmpty")
      .should("be.visible")
      .click();

    H.CustomExpressionEditor.value().should("eq", "CountIf(notEmpty(column))");

    H.expressionEditorWidget().button("Function browser").click();
    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByText("CountIf").should("be.visible");
      cy.findByText("notEmpty").should("be.visible");
    });
  });
});

describe("issue 63180", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            Foo: ["+", 1, 2],
          },
        },
      },
      { visitQuestion: true },
    );

    H.openNotebook();
  });

  it("should not be possible to close the custom expression editor when creating a new expression from a combine or extract shortcut (metabase#63180)", () => {
    function testCombineColumns() {
      H.getNotebookStep("expression").icon("add").click();
      H.expressionEditorWidget().within(() => {
        cy.findByText("Combine columns").click();
        cy.button("Done").scrollIntoView().click();
      });

      cy.log("clicking outside the editor should not close it");
      H.getNotebookStep("data").click();
      H.expressionEditorWidget().should("be.visible");
      H.modal().should("not.exist");

      cy.log("clearing the expression should allow clicking outside to work");
      H.CustomExpressionEditor.clear();
      H.getNotebookStep("data").click();
      H.expressionEditorWidget().should("not.exist");
      H.modal().should("not.exist");
    }

    function testExtractColumns() {
      H.getNotebookStep("expression").icon("add").click();
      H.expressionEditorWidget().within(() => {
        cy.findByText("Extract columns").click();
        cy.findByText("Email").click();
        cy.findByText("Domain").click();
      });

      cy.log("clicking outside the editor should not close it");
      H.getNotebookStep("data").click();
      H.expressionEditorWidget().should("be.visible");
      H.modal().should("not.exist");

      cy.log("clearing the expression should allow clicking outside to work");
      H.CustomExpressionEditor.clear();
      H.getNotebookStep("data").click();
      H.expressionEditorWidget().should("not.exist");
      H.modal().should("not.exist");
    }

    testCombineColumns();
    testExtractColumns();
  });
});
