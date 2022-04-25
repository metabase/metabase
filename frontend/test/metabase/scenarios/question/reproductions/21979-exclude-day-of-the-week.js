import {
  restore,
  openProductsTable,
  visualize,
  popover,
} from "__support__/e2e/cypress";

export function issue21979() {
  describe.skip("issue 21979", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      openProductsTable({ mode: "notebook" });
    });

    it("exclude 'day of the week' should show the correct day reference in the UI (metabase#21979)", () => {
      cy.findByText("Filter").click();
      cy.findByText("Created At").click();

      cy.findByText("Exclude...").click();
      cy.findByText("Days of the week...").click();

      popover().within(() => {
        cy.findByText("Monday").click();

        cy.button("Add filter").click();
      });

      cy.log("Make sure the filter references correct day in the UI");
      cy.findByText("Created At excludes Monday");

      visualize();

      cy.log("Make sure the query is correct");

      // One of the products created on Monday
      cy.findByText("Enormous Marble Wallet").should("not.exist");

      cy.log("Make sure we can re-enable the exluded filter");

      cy.findByText("Created At excludes Monday").click();

      popover().within(() => {
        cy.findByText("Monday").click();

        cy.button("Add filter").click();
      });

      visualize();

      cy.findByText("Enormous Marble Wallet");
    });
  });
}
