import {
  enterCustomColumnDetails,
  restore,
  openProductsTable,
  popover,
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
    enterCustomColumnDetails({ formula: "Lower(" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("lower(text)");
  });

  it("should appear after a field reference", () => {
    enterCustomColumnDetails({ formula: "Lower([Category]" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("lower(text)");
  });

  it("should not appear while outside a function", () => {
    enterCustomColumnDetails({ formula: "Lower([Category])" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("lower(text)").should("not.exist");
  });

  it("should not appear when formula field is not in focus (metabase#15891)", () => {
    enterCustomColumnDetails({ formula: "rou{enter}1.5" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("round([Temperature])");

    // Click outside of formula field instead of blur
    popover().first().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("round([Temperature])").should("not.exist");

    // Should also work with escape key
    cy.get("@formula").focus();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("round([Temperature])");

    cy.get("@formula").type("{esc}");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("round([Temperature])").should("not.exist");
  });

  it("should not disappear when clicked on (metabase#17548)", () => {
    enterCustomColumnDetails({ formula: "rou{enter}" });

    // Shouldn't hide on click
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("round([Temperature])").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("round([Temperature])");
  });
});
