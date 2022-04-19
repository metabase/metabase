import {
  restore,
  appBar,
  popover,
  openNavigationSidebar,
  visitQuestion,
  POPOVER_ELEMENT,
} from "__support__/e2e/cypress";

export function issue18978() {
  describe("11914, 18978, 18977", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should not display query editing controls and 'Browse Data' link", () => {
      cy.createQuestion({
        query: {
          "source-table": "card__1",
        },
      }).then(({ body: { id } }) => {
        cy.signIn("nodata");
        visitQuestion(id);
        openNavigationSidebar();

        cy.findByText(/Browse data/i).should("not.exist");
        cy.icon("add").click();

        popover().within(() => {
          cy.findByText("Question").should("not.exist");
          cy.findByText(/SQL query/).should("not.exist");
          cy.findByText(/Native query/).should("not.exist");
        });

        // Click outside to close the "new" button popover
        appBar().click();

        cy.findByTestId("qb-header-action-panel").within(() => {
          cy.icon("notebook").should("not.exist");
          cy.findByText("Filter").should("not.exist");
          cy.findByText("Summarize").should("not.exist");
        });
        cy.findByTestId("viz-type-button").should("not.exist");
        cy.findByTestId("viz-settings-button").should("not.exist");

        // Ensure no drills offered when clicking a column header
        cy.findByText("Subtotal").click();
        assertNoOpenPopover();

        // Ensure no drills offered when clicking a regular cell
        cy.findByText("6.42").click();
        assertNoOpenPopover();

        // Ensure no drills offered when clicking FK
        cy.findByText("184").click();
        assertNoOpenPopover();
        cy.url().should("include", `/question/${id}`);
      });
    });
  });
}

function assertNoOpenPopover() {
  cy.get(POPOVER_ELEMENT).should("not.exist");
}
