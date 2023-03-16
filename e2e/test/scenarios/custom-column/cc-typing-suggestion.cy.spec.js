import {
  enterCustomColumnDetails,
  getBrokenUpTextMatcher,
  openProductsTable,
  restore,
} from "e2e/support/helpers";

describe("scenarios > question > custom column > typing suggestion", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable({ mode: "notebook" });
    cy.findByText("Custom column").click();
  });

  it("should not suggest arithmetic operators", () => {
    enterCustomColumnDetails({ formula: "[Price] " });
    cy.findByTestId("expression-suggestions-list").should("not.exist");
  });

  it("should correctly accept the chosen field suggestion", () => {
    enterCustomColumnDetails({
      formula: "[Rating]{leftarrow}{leftarrow}{leftarrow}",
    });

    // accept the only suggested item, i.e. "[Rating]"
    cy.get("@formula").type("{enter}");

    // if the replacement is correct -> "[Rating]"
    // if the replacement is wrong -> "[Rating] ng"
    cy.contains("[Rating] ng").should("not.exist");
  });

  it("should correctly accept the chosen function suggestion", () => {
    enterCustomColumnDetails({ formula: "LTRIM([Title])" });

    // Place the cursor between "is" and "empty"
    cy.get("@formula").type("{leftarrow}".repeat(13));

    // accept the first suggested function, i.e. "length"
    cy.get("@formula").type("{enter}");

    cy.contains("length([Title])");
  });

  it("should correctly insert function suggestion with the opening parenthesis", () => {
    enterCustomColumnDetails({ formula: "LOW{enter}" });

    cy.contains("lower(");
  });

  it("should show expression function helper if a proper function is typed", () => {
    enterCustomColumnDetails({ formula: "lower(" });

    cy.findByText(getBrokenUpTextMatcher("lower(text)")).should("be.visible");
    cy.findByText("Returns the string of text in all lower case.").should(
      "be.visible",
    );
    cy.findByText("lower([Status])").should("be.visible");

    cy.findByTestId("expression-helper-popover-arguments")
      .findByText("text")
      .realHover();

    cy.findByText("The column with values to convert to lower case.").should(
      "be.visible",
    );
  });
});
