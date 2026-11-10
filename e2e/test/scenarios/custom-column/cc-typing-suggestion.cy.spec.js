const { H } = cy;

describe("scenarios > question > custom column > typing suggestion", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.openProductsTable({ mode: "notebook" });
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

    cy.log("right-clicking the help text should not close it (metabase#41305)");
    H.CustomExpressionEditor.helpText()
      .findByText("Combine two or more strings of text together.")
      .rightclick();
    H.popover().should("have.length", 2);
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

describe("scenarios > question > custom column > typing suggestion > keyboard (metabase#49342)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not be possible to leave the expression input with the Tab key ", () => {
    // This test used to be a repro for #49342, but the product feature changed
    // so that the expression input can no longer be tabbed out of.

    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();
    H.enterCustomColumnDetails({ formula: "[Tot{Enter}", blur: false });
    cy.realPress("Tab");
    H.CustomExpressionEditor.value().should("equal", "[Total]  ");
    H.CustomExpressionEditor.nameInput().should("not.be.focused");

    cy.log("Shift-tab from name input should stay within the popover");
    H.CustomExpressionEditor.nameInput().focus();
    H.CustomExpressionEditor.nameInput().realPress(["Shift", "Tab"]);
    H.CustomExpressionEditor.nameInput().realPress(["Shift", "Tab"]);
    H.CustomExpressionEditor.nameInput().realPress(["Shift", "Tab"]);
    cy.focused().should("have.attr", "role", "textbox");

    cy.realPress(["Shift", "Tab"]);
    cy.button("Cancel").should("be.focused");

    cy.realPress(["Shift", "Tab"]);
    H.CustomExpressionEditor.nameInput().should("be.focused");
  });
});

const addCustomColumn = () => {
  cy.findByTestId("action-buttons").findByText("Custom column").click();
};

function verifyHelptextPosition(text) {
  H.CustomExpressionEditor.get()
    .findByText(text)
    .then(($text) => {
      H.CustomExpressionEditor.helpText().should(($helpText) => {
        const { left: textLeft } = $text[0].getBoundingClientRect();
        const { left: helpTextLeft } = $helpText[0].getBoundingClientRect();

        expect(helpTextLeft).to.be.closeTo(textLeft, 5);
      });
    });
}
