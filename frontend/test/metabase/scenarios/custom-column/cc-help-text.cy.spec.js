import {
  enterCustomColumnDetails,
  restore,
  openProductsTable,
} from "__support__/e2e/cypress";

describe("scenarios > question > custom column > help text", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable({ mode: "notebook" });
    cy.findByText("Custom column").click();
  });

  it("should appear while inside a function", () => {
    enterCustomColumnDetails({ formula: "Lower(" });
    cy.findByText("lower(text)");
  });

  it("should appear after a field reference", () => {
    // cy.get("[contenteditable='true']").type("Lower([Category]");
    enterCustomColumnDetails({ formula: "Lower([Category]" });
    cy.findByText("lower(text)");
  });

  it("should not appear while outside a function", () => {
    enterCustomColumnDetails({ formula: "Lower([Category])" });
    cy.findByText("lower(text)").should("not.exist");
  });

  it("should not appear when formula field is not in focus (metabase#15891)", () => {
    enterCustomColumnDetails({ formula: "rou{enter}1.5" });

    cy.findByText("round([Temperature])");

    cy.findByText(/Field formula/i).click(); // Click outside of formula field instead of blur
    cy.findByText("round([Temperature])").should("not.exist");

    // Should also work with escape key
    cy.get("@formula").click({ force: true });
    cy.findByText("round([Temperature])");

    cy.get("@formula").type("{esc}", { force: true });
    cy.findByText("round([Temperature])").should("not.exist");
  });

  it("should not disappear when clicked on (metabase#17548)", () => {
    cy.get("[contenteditable='true']").type(`rou{enter}`);

    // Shouldn't hide on click
    cy.findByText("round([Temperature])").click();
    cy.findByText("round([Temperature])");
  });
});
