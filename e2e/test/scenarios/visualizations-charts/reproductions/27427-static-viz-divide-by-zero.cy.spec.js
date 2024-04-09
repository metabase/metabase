import { restore } from "e2e/support/helpers";

const questionDetails = {
  name: "27427",
  native: {
    query:
      "select 1 as sortorder, year(current_timestamp), 1 v1, 2 v2\nunion all select 1, year(current_timestamp)-1, 1, 2",
    "template-tags": {},
  },
  display: "bar",
  visualization_settings: {
    "graph.dimensions": ["EXTRACT(YEAR FROM CURRENT_TIMESTAMP)"],
    "graph.metrics": ["V1", "V2"],
    "graph.series_order_dimension": null,
    "graph.series_order": null,
  },
};

describe("issue 27427", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("static-viz should not fail if there is unused returned column: 'divide by zero' (metabase#27427)", () => {
    assertStaticVizRender(questionDetails, ({ status, body }) => {
      expect(status).to.eq(200);
      expect(body).to.not.include(
        "An error occurred while displaying this card.",
      );
    });
  });
});

function assertStaticVizRender(questionDetails, callback) {
  cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
    cy.request({
      method: "GET",
      url: `/api/pulse/preview_card/${id}`,
      failOnStatusCode: false,
    }).then(response => {
      callback(response);
    });
  });
}
