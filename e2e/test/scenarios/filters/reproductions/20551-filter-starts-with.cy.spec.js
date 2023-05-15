import { restore, openProductsTable, filter } from "e2e/support/helpers";

describe("issue 20551", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow filtering with includes, rather than starts with (metabase#20551)", () => {
    openProductsTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").click();

    // Make sure input field is auto-focused
    cy.focused()
      .should("have.attr", "placeholder", "Search the list")
      .type("i");

    // All categories that contain `i`
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Doohickey");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Gizmo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Widget");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Gadget").should("not.exist");
  });
});
