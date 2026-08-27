const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

describe(
  "scenarios > question > custom column > data type",
  { tags: "@external" },
  () => {
    function addCustomColumns(columns) {
      cy.wrap(columns).each((column, index) => {
        if (index) {
          H.getNotebookStep("expression").icon("add").click();
        } else {
          cy.findByLabelText("Custom column").click();
        }

        H.enterCustomColumnDetails(column);
        cy.button("Done").click({ force: true });
      });
    }

    function openCustomColumnInTable(table) {
      H.openTable({ table, mode: "notebook" });
      cy.findByText("Custom column").click();
    }

    beforeEach(() => {
      H.restore();
      H.restore("postgres-12");

      cy.signInAsAdmin();
    });

    it("should understand string functions (metabase#13217)", () => {
      openCustomColumnInTable(PRODUCTS_ID);

      H.enterCustomColumnDetails({
        formula: "concat([Category], [Title])",
        name: "CategoryTitle",
      });

      cy.button("Done").click();

      H.filter({ mode: "notebook" });

      H.popover().within(() => {
        cy.findByText("CategoryTitle").click();
        cy.findByPlaceholderText("Enter a number").should("not.exist");
        cy.findByPlaceholderText("Enter some text").should("be.visible");
      });
    });

    it("should understand date functions", () => {
      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("QA Postgres12").click();
        cy.findByText("Orders").click();
      });

      addCustomColumns([
        { name: "Year", formula: "year([Created At])" },
        { name: "Quarter", formula: "quarter([Created At])" },
        { name: "Month", formula: "month([Created At])" },
        { name: "Week", formula: 'week([Created At], "iso")' },
        { name: "Day", formula: "day([Created At])" },
        { name: "Weekday", formula: "weekday([Created At])" },
        { name: "Hour", formula: "hour([Created At])" },
        { name: "Minute", formula: "minute([Created At])" },
        { name: "Second", formula: "second([Created At])" },
        {
          name: "Datetime Add",
          formula: 'datetimeAdd([Created At], 1, "month")',
        },
        {
          name: "Datetime Subtract",
          formula: 'datetimeSubtract([Created At], 1, "month")',
        },
        {
          name: "ConvertTimezone 3 args",
          formula: 'convertTimezone([Created At], "Asia/Ho_Chi_Minh", "UTC")',
        },
        {
          name: "ConvertTimezone 2 args",
          formula: 'convertTimezone([Created At], "Asia/Ho_Chi_Minh")',
        },
      ]);

      H.visualize();
    });

    it("should relay the type of a date field", () => {
      openCustomColumnInTable(PEOPLE_ID);

      H.enterCustomColumnDetails({ formula: "[Birth Date]", name: "DoB" });
      cy.button("Done").click();

      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("DoB").click();
        cy.findByPlaceholderText("Enter a number").should("not.exist");
        cy.findByText("Relative date range…").click();
        cy.findByText("Previous").click();
        cy.findByDisplayValue("days").should("be.visible");
      });
    });

    it("should handle CASE (metabase#13122)", () => {
      openCustomColumnInTable(ORDERS_ID);

      H.enterCustomColumnDetails({
        formula: "case([Discount] > 0, [Created At], [Product → Created At])",
        name: "MiscDate",
      });
      cy.button("Done").click();

      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("MiscDate").click();
        cy.findByPlaceholderText("Enter a number").should("not.exist");

        cy.findByText("Relative date range…").click();
        cy.findByText("Previous").click();
        cy.findByDisplayValue("days").should("be.visible");
      });
    });

    it("should handle COALESCE", () => {
      openCustomColumnInTable(ORDERS_ID);

      H.enterCustomColumnDetails({
        formula: "COALESCE([Product → Created At], [Created At])",
        name: "MiscDate",
      });
      cy.button("Done").click();

      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("MiscDate").click();
        cy.findByPlaceholderText("Enter a number").should("not.exist");
        cy.findByText("Relative date range…").click();
        cy.findByText("Previous").click();
        cy.findByDisplayValue("days").should("be.visible");
      });
    });
  },
);

describe("scenarios > question > custom column > error feedback", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.openProductsTable({ mode: "notebook" });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
  });

  it("should catch non-existent field reference", () => {
    H.enterCustomColumnDetails({
      formula: "abcdef",
      name: "Non-existent",
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains(/^Unknown column: abcdef/i);
  });

  it("should fail on expression validation errors", () => {
    H.enterCustomColumnDetails({
      formula: "SUBSTRING('foo', 0, 1)",
      name: "BadSubstring",
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains(/positive integer/i);
  });
});

// ExpressionEditorTextfield jsx component
describe("scenarios > question > custom column > expression editor", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    // This is the default screen size but we need it explicitly set for this test because of the resize later on
    cy.viewport(1280, 800);

    H.openOrdersTable({ mode: "notebook" });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "1+1", // Formula was intentionally written without spaces (important for this repro)!
      name: "Math",
    });
    cy.button("Done").should("not.be.disabled");
  });

  it("should not accidentally delete Custom Column formula value and/or Custom Column name (metabase#15734)", () => {
    H.CustomExpressionEditor.type(
      "{movetoend}{leftarrow}{movetostart}{rightarrow}{rightarrow}",
    );
    cy.findByDisplayValue("Math").focus();
    cy.button("Done").should("not.be.disabled");
  });

  it("should not erase Custom column formula and Custom column name when expression is incomplete (metabase#16126)", () => {
    H.CustomExpressionEditor.type("{movetoend}{backspace}").blur();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Expected expression");
    cy.button("Done").should("be.disabled");
  });

  it("should not erase Custom Column formula and Custom Column name on window resize (metabase#16127)", () => {
    cy.viewport(1260, 800);
    cy.findByDisplayValue("Math");
    cy.button("Done").should("not.be.disabled");
  });
});

describe("scenarios > question > custom column > help text", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.openProductsTable({ mode: "notebook" });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
  });

  it("should appear while inside a function", () => {
    H.enterCustomColumnDetails({ formula: "lower(", blur: false });
    H.CustomExpressionEditor.helpTextHeader()
      .should("be.visible")
      .should("contain", "lower(value)");
  });

  it("should appear after a field reference", () => {
    H.enterCustomColumnDetails({ formula: "lower([Category]", blur: false });
    H.CustomExpressionEditor.helpTextHeader()
      .should("be.visible")
      .should("contain", "lower(value)");
  });

  it("should not appear while outside a function", () => {
    H.enterCustomColumnDetails({ formula: "lower([Category])", blur: false });
    H.CustomExpressionEditor.helpTextHeader().should("not.exist");
  });

  it("should not appear when formula field is not in focus (metabase#15891)", () => {
    H.enterCustomColumnDetails({
      formula: "rou{enter}1.5{leftArrow}",
      blur: false,
    });

    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "round([Temperature])");

    cy.log("Blur event should remove the expression helper popover");
    H.CustomExpressionEditor.blur();
    H.CustomExpressionEditor.helpText().should("not.exist");

    H.CustomExpressionEditor.focus().type("{leftArrow}");
    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "round([Temperature])");

    cy.log(
      "Pressing `escape` key should also remove the expression helper popover",
    );
    H.CustomExpressionEditor.blur();
    H.CustomExpressionEditor.helpText().should("not.exist");
  });

  it("should not disappear when clicked on (metabase#17548)", () => {
    H.enterCustomColumnDetails({ formula: "round(", blur: false });

    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "round([Temperature])");

    // Shouldn't hide on click
    H.CustomExpressionEditor.helpText().click();

    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "round([Temperature])");
  });

  describe("scenarios > question > custom column > help text > visibility", () => {
    beforeEach(() => {
      H.enterCustomColumnDetails({ formula: "round(", blur: false });
    });

    it("should be possible to show and hide the help text when there are no suggestions", () => {
      assertHelpTextIsVisible();

      H.CustomExpressionEditor.helpTextHeader().click();
      assertNeitherAreVisible();

      H.CustomExpressionEditor.helpTextHeader().click();
      assertHelpTextIsVisible();
    });

    it("should show the help text again when the suggestions are closed", () => {
      H.CustomExpressionEditor.type("[Rat", { focus: false });

      cy.log("suggestions should be visible");
      assertSuggestionsAreVisible();

      cy.log("help text should remain visible when suggestions are picked");
      // helptext should re-open when suggestion is picked
      H.CustomExpressionEditor.selectCompletion("Rating");
      assertHelpTextIsVisible();
    });

    it("should be possible to close the help text", () => {
      cy.log("hide help text by clicking the header");
      H.CustomExpressionEditor.helpTextHeader().click();
      assertNeitherAreVisible();

      cy.log("type to see suggestions");
      H.CustomExpressionEditor.type("[Rat", { focus: false });
      assertSuggestionsAreVisible();

      cy.log("help text should remain hidden after selecting a suggestion");
      H.CustomExpressionEditor.selectCompletion("Rating");
      assertNeitherAreVisible();
    });

    it("should be possible to prefer showing the help text over the suggestions", () => {
      cy.log("type to see suggestions");
      H.CustomExpressionEditor.type("[Rat", { focus: false });
      assertSuggestionsAreVisible();

      cy.log("show help text by clicking the header");
      H.CustomExpressionEditor.helpTextHeader().click();
      assertHelpTextIsVisible();

      cy.log("help text should remain shown after finishing typing");
      H.CustomExpressionEditor.type("ing], ", { focus: false });
      assertHelpTextIsVisible();
    });

    it("should be possible to prefer showing the suggestion when typing", () => {
      cy.log("type to see suggestions");
      H.CustomExpressionEditor.type("[Rat", { focus: false });
      assertSuggestionsAreVisible();

      cy.log("show help text by clicking the header");
      H.CustomExpressionEditor.helpTextHeader().click();
      assertHelpTextIsVisible();

      cy.log("show suggestions again by clicking the header");
      H.CustomExpressionEditor.helpTextHeader().click();
      assertSuggestionsAreVisible();

      cy.log("help text should remain shown after finishing typing");
      H.CustomExpressionEditor.type("ing], ", { focus: false });
      assertNeitherAreVisible();
    });

    function assertSuggestionsAreVisible() {
      cy.log("suggestions should be visible");
      H.CustomExpressionEditor.helpText().should("not.exist");
      H.CustomExpressionEditor.completions()
        .findAllByRole("option")
        .should("be.visible");
    }
    function assertHelpTextIsVisible() {
      cy.log("help text should be visible");
      H.CustomExpressionEditor.helpText().should("be.visible");
      H.CustomExpressionEditor.completions()
        .findByRole("option")
        .should("not.exist");
    }
    function assertNeitherAreVisible() {
      H.CustomExpressionEditor.helpText().should("not.exist");
      H.CustomExpressionEditor.completions()
        .findByRole("option")
        .should("not.exist");
    }
  });
});

describe("scenarios > question > custom column > exiting the editor", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.openProductsTable({ mode: "notebook" });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
  });

  it("should be possible to close the custom expression editor by pressing Escape when it is empty", () => {
    cy.realPress("Escape");
    H.CustomExpressionEditor.get().should("not.exist");
  });

  it("should not be possible to close the custom expression editor by pressing Escape when it is not empty", () => {
    H.CustomExpressionEditor.type("count(");
    cy.realPress("Escape");
    H.CustomExpressionEditor.get().should("be.visible");
  });

  it("should be possible to exit the editor by clicking outside of it when there is no text", () => {
    H.getNotebookStep("data").click();
    H.modal().should("not.exist");
    H.expressionEditorWidget().should("not.exist");
  });

  it("should be possible to exit the editor by clicking outside of it when there is no text, by clicking an interactive element", () => {
    H.getNotebookStep("data").button("Pick columns").click();
    H.modal().should("not.exist");
    H.expressionEditorWidget().should("not.exist");
    H.popover().findByText("Select all").should("be.visible");
  });

  it("should not be possible to exit the editor by clicking outside of it when there is an unsaved expression", () => {
    H.enterCustomColumnDetails({ formula: "1+1", blur: false });
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("Select all").should("not.exist");
    H.expressionEditorWidget().should("exist");

    H.modal().within(() => {
      cy.findByText("Keep editing your custom expression?").should(
        "be.visible",
      );
      cy.button("Discard changes").should("be.enabled");
      cy.button("Keep editing").click();
    });

    H.modal().should("not.exist");
    H.expressionEditorWidget().should("exist");
  });

  it("should be possible to discard changes when clicking outside of the editor", () => {
    H.enterCustomColumnDetails({ formula: "1+1", blur: false });
    H.getNotebookStep("data").button("Pick columns").click();
    H.expressionEditorWidget().should("exist");
    H.popover().findByText("Select all").should("not.exist");

    H.modal().within(() => {
      cy.findByText("Keep editing your custom expression?").should(
        "be.visible",
      );
      cy.button("Keep editing").should("be.enabled");
      cy.button("Discard changes").click();
    });

    H.modal().should("not.exist");
    H.expressionEditorWidget().should("not.exist");
  });

  it("should be possible to discard changes by clicking cancel button", () => {
    H.enterCustomColumnDetails({ formula: "1+1", name: "OK" });
    H.expressionEditorWidget().button("Cancel").click();
    H.modal().should("not.exist");
    H.expressionEditorWidget().should("not.exist");
    H.getNotebookStep("expression").findByText("OK").should("not.exist");
  });

  it("should be possible to close the popover when navigating away from the expression editor", () => {
    H.expressionEditorWidget().button("Cancel").click();
    cy.button("Summarize").click();
    H.popover().as("popover").findByText("Custom Expression").click();
    H.enterCustomColumnDetails({ formula: "1+1" });

    cy.log("Go back to summarize modal");
    H.popover().findByText("Custom Expression").click();

    cy.log("Close summarize modal by clicking outside");
    cy.findByLabelText("View SQL").click();

    H.modal().should("not.exist");
    cy.get("popover").should("not.exist");
  });
});
