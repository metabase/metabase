import { restore, openProductsTable, filter } from "__support__/e2e/helpers";

describe("issue 20551", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow filtering with includes, rather than starts with (metabase#20551)", () => {
    openProductsTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    cy.findByText("Category").click();

    // Make sure input field is auto-focused
    cy.focused()
      .should("have.attr", "placeholder", "Search the list")
      .type("i");

    // All categories that contain `i`
    cy.findByText("Doohickey");
    cy.findByText("Gizmo");
    cy.findByText("Widget");

    cy.findByText("Gadget").should("not.exist");
  });
});
