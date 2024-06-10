import {
  enterCustomColumnDetails,
  openProductsTable,
  popover,
  restore,
  summarize,
} from "e2e/support/helpers";

describe("scenarios > question > custom column > typing suggestion", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable({ mode: "notebook" });
  });

  it("should not suggest arithmetic operators", () => {
    addCustomColumn();
    enterCustomColumnDetails({ formula: "[Price] " });
    cy.findByTestId("expression-suggestions-list").should("not.exist");
  });

  it("should correctly accept the chosen field suggestion", () => {
    addCustomColumn();
    enterCustomColumnDetails({
      formula: "[Rating]{leftarrow}{leftarrow}{leftarrow}",
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
    enterCustomColumnDetails({ formula: "LTRIM([Title])" });

    // Place the cursor between "is" and "empty"
    cy.get("@formula").type("{leftarrow}".repeat(13));

    // accept the first suggested function, i.e. "length"
    cy.get("@formula").type("{enter}");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("length([Title])");
  });

  it("should correctly insert function suggestion with the opening parenthesis", () => {
    addCustomColumn();
    enterCustomColumnDetails({ formula: "BET{enter}" });

    cy.findByTestId("expression-editor-textfield").should(
      "contain",
      "between(",
    );
  });

  it("should show expression function helper if a proper function is typed", () => {
    addCustomColumn();
    enterCustomColumnDetails({ formula: "lower(" });

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
    summarize({ mode: "notebook" });
    popover().findByText("Custom Expression").click();
    enterCustomColumnDetails({ formula: "Count{enter}" });
    popover().findByLabelText("Name").focus();
    cy.findByTestId("expression-suggestions-list").should("not.exist");
  });
});

const addCustomColumn = () => {
  cy.findByTestId("action-buttons").findByText("Custom column").click();
};
