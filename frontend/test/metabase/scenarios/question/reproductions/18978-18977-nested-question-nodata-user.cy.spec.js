import {
  restore,
  popover,
  openNavigationSidebar,
  visitQuestion,
} from "__support__/e2e/cypress";

describe("18978, 18977", () => {
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
        cy.findByText("SQL query").should("not.exist");
      });

      cy.findByTestId("qb-header-action-panel").within(() => {
        cy.icon("notebook").should("not.exist");
        cy.findByText("Filter").should("not.exist");
        cy.findByText("Summarize").should("not.exist");
      });
      cy.findByTestId("viz-type-button").should("not.exist");
      cy.findByTestId("viz-settings-button").should("not.exist");
    });
  });
});
