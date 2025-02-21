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
    H.enterCustomColumnDetails({ formula: "LTRIM([Title])", blur: false });

    // Place the cursor between "is" and "empty"
    cy.get("@formula").type("{leftarrow}".repeat(13));

    // accept the first suggested function, i.e. "length"
    cy.get("@formula").type("{enter}");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("length([Title])");
  });

  it("should correctly insert function suggestion with the opening parenthesis", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "BET{enter}" });

    cy.findByTestId("expression-editor-textfield").should(
      "contain",
      "between(",
    );
  });

  it("should show expression function helper if a proper function is typed", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "lower(", blur: false });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("lower(text)");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Returns the string of text in all lower case.").should(
      "be.visible",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("lower([Status])").should("be.visible");

    cy.findByTestId("expression-helper-popover-arguments")
      .findByText("text")
      .realHover();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("The column with values to convert to lower case.").should(
      "be.visible",
    );
  });

  it("should not show suggestions for an unfocused field (metabase#31643)", () => {
    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({ formula: "Count{enter}" });
    H.popover().findByLabelText("Name").focus();
    cy.findByTestId("expression-suggestions-list").should("not.exist");
  });

  it("should always show the help text popover on top of the custom expression widget (metabase#52711)", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "endsWith(", blur: false });

    /* It seems like cypress considers that this popover and its contents are visible,
     * even when it's under its parent popover because it is in a portal, so technically it's not being clipped by any element.
     * Weirdly enough, it refuses to click `Learn more` because it's covered, but should("be.visible") passes.
     *
     * So, the (hacky) solution for now is to click all 5 elements of the popover, and we will check if the
     * popover is still there at the end. Since the popover has onClickOutside behavior, the popover will
     * close if the user clicks on anything outside it, so we can use that to our advantage.
     * */
    cy.findByTestId("expression-helper-popover").within(() => {
      cy.findByTestId("expression-helper-popover-structure").click();
      cy.findByTestId("expression-helper-popover-arguments").click();
      cy.findByText("Example").click();

      // We want to trigger the "covered element" error if this is true without actually clicking the external link
      cy.findByText("Learn more").trigger("mousemove");
    });
    cy.findByTestId("expression-helper-popover").should("exist");
  });
});

const addCustomColumn = () => {
  cy.findByTestId("action-buttons").findByText("Custom column").click();
};
