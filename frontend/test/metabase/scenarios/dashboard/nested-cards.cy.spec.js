import { signIn, restore, popover } from "__support__/cypress";

describe("scenarios > dashboard > nested cards", () => {
  before(restore);
  beforeEach(signIn);

  it("should show fields on nested cards", () => {
    createDashboardWithNestedCard(dashId => {
      cy.visit(`/dashboard/${dashId}`);
      cy.get(".Icon-pencil").click();
      cy.get(".Icon-funnel_add").click();
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
});

function createDashboardWithNestedCard(callback) {
  cy.request("POST", "/api/card", {
    name: "Q1",
    dataset_query: {
      type: "native",
      native: { query: 'SELECT * FROM "ORDERS"', "template-tags": {} },
      database: 1,
    },
    display: "table",
    description: null,
    visualization_settings: {},
    collection_id: null,
  }).then(({ body }) =>
    cy
      .request("POST", "/api/card", {
        name: "Q2",
        display: "table",
        visualization_settings: {},
        dataset_query: {
          database: 1,
          query: { "source-table": `card__${body.id}` },
          type: "query",
        },
      })
      .then(({ body: { id: cardId } }) =>
        cy
          .request("POST", "/api/dashboard", { name: "Q2 in a dashboard" })
          .then(({ body: { id: dashId } }) => {
            cy.request("POST", `/api/dashboard/${dashId}/cards`, { cardId });
            callback(dashId);
          }),
      ),
  );
}
