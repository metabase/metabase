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
      formula:
        "[Rating]{leftarrow}{leftarrow}{leftarrow}{backspace}{backspace}t",
      blur: false,
    });

    // accept the only suggested item, i.e. "[Rating]"
    H.CustomExpressionEditor.acceptCompletion();

    // if the replacement is correct -> "[Rating]"
    // if the replacement is wrong -> "[Rating] ng"
    H.CustomExpressionEditor.value().should("equal", "[Rating]");
  });

  it("should correctly accept the chosen function suggestion", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "le", blur: false });

    H.CustomExpressionEditor.acceptCompletion();

    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "length([Comment])");
  });

  it("should correctly insert function suggestion with the template", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "bet", blur: false });
    H.CustomExpressionEditor.acceptCompletion();
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
    H.enterCustomColumnDetails({ formula: "Count{enter}", blur: true });
    H.CustomExpressionEditor.completions().should("not.exist");
  });

  it("should always show the help text popover on top of the custom expression widget (metabase#52711)", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "concat(", blur: false });

    /**
     * It seems like cypress considers that this popover and its contents
     * are visible, even when it's under its parent popover because it is
     * in a portal, so technically it's not being clipped by any element.
     * Weirdly enough, it refuses to click `Learn more` because it's covered,
     * but should("be.visible") passes.
     *
     * So, the (hacky) solution for now is to click all 5 elements of the popover,
     * and we will check if the popover is still there at the end.
     * Since the popover has onClickOutside behavior, the popover will
     * close if the user clicks on anything outside it, so we can use
     * that to our advantage.
     *
     * This has the advantage of also testing the click behaviour of popover,
     * which should not close when it is being clicked on.
     */

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
    verifyHelptextPosition('"foo"');

    H.CustomExpressionEditor.type(', "bar"', { focus: false });
    verifyHelptextPosition('"bar"');

    H.CustomExpressionEditor.type(', "baz"', { focus: false });
    verifyHelptextPosition('"baz"');

    cy.log("move curser into baz");
    H.CustomExpressionEditor.type("{leftarrow}".repeat(3), { focus: false });
    verifyHelptextPosition('"baz"');

    cy.log("move cursor to bar");
    H.CustomExpressionEditor.type("{leftarrow}".repeat(5), { focus: false });
    verifyHelptextPosition('"bar"');

    cy.log("move cursor to foo");
    H.CustomExpressionEditor.type("{leftarrow}".repeat(10), { focus: false });
    verifyHelptextPosition('"foo"');

    cy.log("move cursor to contains(, right after (");
    H.CustomExpressionEditor.type("{leftarrow}".repeat(1), { focus: false });
    verifyHelptextPosition("contains");

    cy.log("move cursor to contains(, right before (");
    H.CustomExpressionEditor.type("{leftarrow}".repeat(1), { focus: false });
    verifyHelptextPosition("contains");

    cy.log("move cursor into contains");
    H.CustomExpressionEditor.type("{leftarrow}".repeat(2), { focus: false });
    verifyHelptextPosition("contains");

    cy.log("move cursor to bar using the mouse");
    H.CustomExpressionEditor.get().findByText('"bar"').click();
    verifyHelptextPosition('"bar"');

    cy.log("move cursor to foo using the mouse");
    H.CustomExpressionEditor.get().findByText('"foo"').click();
    verifyHelptextPosition('"foo"');

    cy.log("move cursor to baz using the mouse");
    H.CustomExpressionEditor.get().findByText('"baz"').click();
    verifyHelptextPosition('"baz"');
  });
});

const addCustomColumn = () => {
  cy.findByTestId("action-buttons").findByText("Custom column").click();
};

function verifyHelptextPosition(text) {
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
