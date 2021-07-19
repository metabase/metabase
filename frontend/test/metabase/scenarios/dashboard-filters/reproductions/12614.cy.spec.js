import { restore, popover } from "__support__/e2e/cypress";

describe("issue 12614", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show fields on nested cards (metabase#12614)", () => {
    createDashboardWithNestedCard();

    cy.icon("pencil").click();
    cy.icon("filter").click();

    popover()
      .contains("Time")
      .click();
    popover()
      .contains("All Options")
      .click();

    cy.get(".DashCard")
      .contains("Select")
      .click();

    popover().contains("CREATED_AT");
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
      .then(({ body: { id: card_id } }) =>
        cy
          .createDashboard("Q2 in a dashboard")
          .then(({ body: { id: dashId } }) => {
            cy.request("POST", `/api/dashboard/${dashId}/cards`, { card_id });
            cy.visit(`/dashboard/${dashId}`);
          }),
      ),
  );
}
