import { restore } from "__support__/e2e/cypress";

describe("scenarios > dashboard > title drill", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

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
  cy.createNativeQuestion({
    name: "Q1",
    native: { query: 'SELECT 1 as "foo", 2 as "bar"', "template-tags": {} },
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
