import { signIn, restore } from "__support__/cypress";

describe("scenarios > dashboard > title drill", () => {
  before(restore);
  beforeEach(signIn);

  it("should let you click through the title to the query builder", () => {
    createDashboard(dashId => {
      cy.visit(`/dashboard/${dashId}`);
      // wait for qustion to load
      cy.findByText("foo");
      // drill through title
      cy.findByText("Q1").click();
      cy.findByText("This question is written in SQL."); // check that we're in the QB now
      cy.findByText("foo");
      cy.findByText("bar");
    });
  });
});

function createDashboard(callback) {
  cy.request("POST", "/api/card", {
    name: "Q1",
    dataset_query: {
      type: "native",
      native: { query: 'SELECT 1 as "foo", 2 as "bar"', "template-tags": {} },
      database: 1,
    },
    display: "bar",
    visualization_settings: {
      "graph.dimensions": ["foo"],
      "graph.metrics": ["bar"],
    },
  }).then(({ body }) =>
    cy
      .request("POST", "/api/dashboard", { name: "dashing dashboard" })
      .then(({ body: { id: dashId } }) => {
        cy.request("POST", `/api/dashboard/${dashId}/cards`, {
          cardId: body.id,
        });
        callback(dashId);
      }),
  );
}
