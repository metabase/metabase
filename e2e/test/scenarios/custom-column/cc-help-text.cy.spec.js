import {
  enterCustomColumnDetails,
  restore,
  openProductsTable,
} from "e2e/support/helpers";

describe("scenarios > question > custom column > help text", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
  });

  it("should appear while inside a function", () => {
    enterCustomColumnDetails({ formula: "Lower(", blur: false });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("lower(text)");
  });

  it("should appear after a field reference", () => {
    enterCustomColumnDetails({ formula: "Lower([Category]", blur: false });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("lower(text)");
  });

  it("should not appear while outside a function", () => {
    enterCustomColumnDetails({ formula: "Lower([Category])", blur: false });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("lower(text)").should("not.exist");
  });

  it("should not appear when formula field is not in focus (metabase#15891)", () => {
    enterCustomColumnDetails({
      formula: "rou{enter}1.5){leftArrow}",
      blur: false,
    });

    cy.findByTestId("expression-helper-popover").findByText(
      "round([Temperature])",
    );

    cy.log("Blur event should remove the expression helper popover");
    cy.get("@formula").blur();
    cy.findByTestId("expression-helper-popover").should("not.exist");

    cy.get("@formula").focus();
    cy.findByTestId("expression-helper-popover").findByText(
      "round([Temperature])",
    );

    cy.log(
      "Pressing `escape` key should also remove the expression helper popover",
    );
    cy.get("@formula").type("{esc}");
    cy.findByTestId("expression-helper-popover").should("not.exist");
  });

  it("should not disappear when clicked on (metabase#17548)", () => {
    enterCustomColumnDetails({ formula: "rou{enter}", blur: false });

    // Shouldn't hide on click
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("round([Temperature])").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("round([Temperature])");
  });
});
