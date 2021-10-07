import { restore, openProductsTable, popover } from "__support__/e2e/cypress";

describe("scenarios > question > custom column > help text", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable({ mode: "notebook" });
    cy.findByText("Custom column").click();
  });

  describe("error feedback", () => {
    it("should catch mismatched parentheses", () => {
      popover().within(() => {
        cy.get("[contenteditable='true']").type("FLOOR [Price]/2)");
        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type("Massive Discount");

        cy.contains(/^Expecting an opening parenthesis after function FLOOR/i);
      });
    });

    it("should catch missing parentheses", () => {
      popover().within(() => {
        cy.get("[contenteditable='true']").type("LOWER [Vendor]");
        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type("Massive Discount");

        cy.contains(/^Expecting an opening parenthesis after function LOWER/i);
      });
    });

    it("should catch invalid characters", () => {
      popover().within(() => {
        cy.get("[contenteditable='true']").type("[Price] / #");
        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type("Massive Discount");
        cy.contains(/^Invalid character: #/i);
      });
    });

    it("should catch unterminated string literals", () => {
      popover().within(() => {
        cy.get("[contenteditable='true']")
          .type('[Category] = "widget')
          .blur();

        cy.findByText("Missing closing quotes");
      });
    });

    it("should catch unterminated field reference", () => {
      popover().within(() => {
        cy.get("[contenteditable='true']").type("[Price / 2");
        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type("Massive Discount");

        cy.contains(/^Missing a closing bracket/i);
      });
    });

    it("should catch non-existent field reference", () => {
      popover().within(() => {
        cy.get("[contenteditable='true']").type("abcdef");
        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type("Non-existent");

        cy.contains(/^Unknown Field: abcdef/i);
      });
    });
  });
});
