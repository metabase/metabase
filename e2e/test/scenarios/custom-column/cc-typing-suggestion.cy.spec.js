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
    H.CustomExpressionEditor.shouldContain("between(column, start, end)");
  });

  it("should show expression function helper if a proper function is typed", () => {
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "lower(", blur: false });

    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "lower(⟨text⟩)")
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
    addCustomColumn();
    H.enterCustomColumnDetails({ formula: "concat", blur: false });

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
});

const addCustomColumn = () => {
  cy.findByTestId("action-buttons").findByText("Custom column").click();
};
