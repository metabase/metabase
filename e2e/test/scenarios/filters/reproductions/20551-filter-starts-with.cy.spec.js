import {
  restore,
  openProductsTable,
  filter,
  popover,
} from "e2e/support/helpers";

describe("issue 20551", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow filtering with includes, rather than starts with (metabase#20551)", () => {
    openProductsTable({ mode: "notebook" });
    filter({ mode: "notebook" });

    popover().within(() => {
      cy.findByText("Category").click();
      cy.focused()
        .should("have.attr", "placeholder", "Search the list")
        .type("i");

      cy.findByText("Doohickey").should("be.visible");
      cy.findByText("Gizmo").should("be.visible");
      cy.findByText("Widget").should("be.visible");
      cy.findByText("Gadget").should("not.exist");
    });
  });
});
