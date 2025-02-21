const { H } = cy;

describe("scenarios > question > custom column > typing suggestion", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.openProductsTable({ mode: "notebook" });
  });

  it("should not suggest arithmetic operators", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "[Price] " });
    cy.findByTestId("expression-suggestions-list").should("not.exist");
  });

  it("should correctly accept the chosen field suggestion", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({
      formula: "[Rating]{leftarrow}{leftarrow}{leftarrow}",
      blur: false,
    });

    // accept the only suggested item, i.e. "[Rating]"
    cy.get("@formula").type("{enter}");

    // if the replacement is correct -> "[Rating]"
    // if the replacement is wrong -> "[Rating] ng"
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("[Rating] ng").should("not.exist");
  });

  it("should correctly accept the chosen function suggestion", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "le", blur: false });

    H.CustomExpressionEditor.completions().should("be.visible");

    // accept the first suggested function, i.e. "length"
    cy.realPress("Enter");

    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "length([Comment])");
  });

  it("should correctly insert function suggestion with the template", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "bet{enter}" });
    H.CustomExpressionEditor.value().should(
      "equal",
      "between(column, start, end)",
    );
  });

  it("should show expression function helper if a proper function is typed", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "lower(", blur: false });

    H.CustomExpressionEditor.helpTextHeader()
      .should("be.visible")
      .should("contain", "lower(text)");

    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .within(() => {
        cy.findByText("Returns the string of text in all lower case.").should(
          "be.visible",
        );
        cy.findByText(
          "The column with values to convert to lower case.",
        ).should("be.visible");
      });
  });

  it("should not show suggestions for an unfocused field (metabase#31643)", () => {
    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({ formula: "Count{enter}" });
    H.popover().findByLabelText("Name").focus();
    H.CustomExpressionEditor.completions().should("not.exist");
  });

  it("should always show the help text popover on top of the custom expression widget (metabase#52711)", () => {
    cy.viewport(1200, 1000);
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "concat(", blur: false });

    H.CustomExpressionEditor.helpText().within(() => {
      cy.findByText(
        "Combine two or more strings of text together.",
      ).realClick();
      cy.findByText("Example").realClick();

      // We want to trigger the "covered element" error if this is true without actually clicking the external link
      cy.findByText("Learn more").trigger("mousemove");
    });
    H.CustomExpressionEditor.helpText().should("be.visible");
  });

  it("should be possible to collapse the help text popover", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "concat(", blur: false });

    H.CustomExpressionEditor.helpText().should("be.visible");
    H.CustomExpressionEditor.helpTextHeader().click();
    H.CustomExpressionEditor.helpText().should("not.exist");
    H.CustomExpressionEditor.helpTextHeader().click();
    H.CustomExpressionEditor.helpText().should("be.visible");
  });

  it("the help text popover should collapse when there is not enough space to render it and the completions", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "concat(", blur: false });
    cy.viewport(1280, 700);

    H.CustomExpressionEditor.helpText().should("be.visible");

    H.CustomExpressionEditor.type("[", { focus: false });
    H.CustomExpressionEditor.completions()
      .get("ul[role=listbox]")
      .should("be.visible");
    H.CustomExpressionEditor.helpText().should("not.exist");

    H.CustomExpressionEditor.helpTextHeader().click();
    H.CustomExpressionEditor.helpText().should("be.visible");
    H.CustomExpressionEditor.completions()
      .get("ul[role=listbox]")
      .should("not.be.visible");

    H.CustomExpressionEditor.type("I", { focus: false });
    H.CustomExpressionEditor.helpText().should("not.exist");
    H.CustomExpressionEditor.completions()
      .get("ul[role=listbox]")
      .should("be.visible");
  });

  it("the help text popover should follow the cursor position", () => {
    addCustomColumn();

    H.CustomExpressionEditor.type('contains("foo"', { focus: false });
    compareHelptextPosition('"foo"');

    H.CustomExpressionEditor.type(', "bar"', { focus: false });
    compareHelptextPosition('"bar"');

    H.CustomExpressionEditor.type(', "baz"', { focus: false });
    compareHelptextPosition('"baz"');

    // move curser into baz
    H.CustomExpressionEditor.type("{leftarrow}".repeat(3), { focus: false });
    compareHelptextPosition('"baz"');

    // move cursor to bar
    H.CustomExpressionEditor.type("{leftarrow}".repeat(5), { focus: false });
    compareHelptextPosition('"bar"');

    // move cursor to foo
    H.CustomExpressionEditor.type("{leftarrow}".repeat(10), { focus: false });
    compareHelptextPosition('"foo"');

    // move cursor to contains(, right after (
    H.CustomExpressionEditor.type("{leftarrow}".repeat(1), { focus: false });
    compareHelptextPosition("contains");

    // move cursor to contains(, right before (
    H.CustomExpressionEditor.type("{leftarrow}".repeat(1), { focus: false });
    compareHelptextPosition("contains");

    // move cursor into contains
    H.CustomExpressionEditor.type("{leftarrow}".repeat(2), { focus: false });
    compareHelptextPosition("contains");

    // move cursor to bar using the mouse
    H.CustomExpressionEditor.get().findByText('"bar"').click();
    compareHelptextPosition('"bar"');

    // move cursor to foo using the mouse
    H.CustomExpressionEditor.get().findByText('"foo"').click();
    compareHelptextPosition('"foo"');

    // move cursor to baz using the mouse
    H.CustomExpressionEditor.get().findByText('"baz"').click();
    compareHelptextPosition('"baz"');
  });
});

const addCustomColumn = () => {
  cy.findByTestId("action-buttons").findByText("Custom column").click();
};

function compareHelptextPosition(text) {
  // allow the tooltip to update first
  cy.wait(50);

  H.CustomExpressionEditor.get()
    .findByText(text)
    .then($element => {
      const { left: textLeft } = $element[0].getBoundingClientRect();

      H.CustomExpressionEditor.helpText().then($element => {
        const { left: helpTextLeft } = $element[0].getBoundingClientRect();

        expect(helpTextLeft).to.be.closeTo(textLeft, 5);
      });
    });
}
