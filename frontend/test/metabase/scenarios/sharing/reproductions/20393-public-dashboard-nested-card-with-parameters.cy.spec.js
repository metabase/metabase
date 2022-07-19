import { restore, popover, visitDashboard } from "__support__/e2e/helpers";

describe("issue 20393", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show public dashboards with nested cards mapped to parameters (metabase#20393)", () => {
    createDashboardWithNestedCard();

    // add a date parameter to the dashboard
    cy.icon("pencil").click();
    cy.icon("filter").click();
    popover().contains("Time").click();
    popover().contains("All Options").click();

    // map the date parameter to the card
    cy.get(".DashCard").contains("Select").click();
    popover().contains("CREATED_AT").click();

    // save the dashboard
    cy.findByText("Save").click();

    // open the sharing modal and enable sharing
    cy.icon("share").click();
    cy.findByRole("switch").click();

    // navigate to the public dashboard link
    cy.findByText("Public link")
      .parent()
      .within(() => {
        cy.get("input").then(input => {
          cy.visit(input.val());
        });
      });

    // verify that the card is visible on the page
    cy.findByText("Q2");
  });
});

function createDashboardWithNestedCard() {
  cy.createNativeQuestion({
    name: "Q1",
    native: { query: 'SELECT * FROM "ORDERS"', "template-tags": {} },
  }).then(({ body }) =>
    cy
      .createQuestion({
        name: "Q2",
        query: { "source-table": `card__${body.id}` },
      })
      .then(({ body: { id: cardId } }) =>
        cy
          .createDashboard("Q2 in a dashboard")
          .then(({ body: { id: dashId } }) => {
            cy.request("POST", `/api/dashboard/${dashId}/cards`, { cardId });
            visitDashboard(dashId);
          }),
      ),
  );
}
