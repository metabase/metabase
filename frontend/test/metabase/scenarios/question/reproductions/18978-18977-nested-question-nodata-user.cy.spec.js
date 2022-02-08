import { restore, popover } from "__support__/e2e/cypress";

describe("18978, 18977", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("/api/card/*/query").as("cardQuery");
  });

  it("should not display query editing controls and 'Browse Data' link", () => {
    cy.createQuestion({
      query: {
        "source-table": "card__1",
      },
    }).then(({ body: { id } }) => {
      cy.signIn("nodata");
      cy.visit(`/question/${id}`);
      cy.wait("@cardQuery");

      cy.get(".Nav").within(() => {
        cy.findByText(/Browse data/i).should("not.exist");
        cy.icon("add").click();
      });

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
