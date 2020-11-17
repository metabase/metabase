import { signInAsAdmin, restore, signIn } from "__support__/cypress";

describe("scenarios > question > native subquery", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should allow a user with no data access to execute a native subquery", () => {
    // Create the initial SQL question and followup nested question
    cy.request("POST", "/api/card", {
      name: "People in WA",
      dataset_query: {
        type: "native",
        native: {
          query: "select * from PEOPLE where STATE = 'WA'",
        },
        database: 1,
      },
      display: "table",
      description: null,
      visualization_settings: {},
      collection_id: null,
      result_metadata: null,
      metadata_checksum: null,
    })
      .then(response => {
        cy.wrap(response.body.id).as("nestedQuestionId");
        const tagID = `#${response.body.id}`;

        cy.request("POST", "/api/card", {
          name: "Count of People in WA",
          dataset_query: {
            type: "native",
            native: {
              query: `select COUNT(*) from {{#${response.body.id}}}`,
              "template-tags": {
                [tagID]: {
                  id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
                  name: tagID,
                  "display-name": tagID,
                  type: "card",
                  "card-id": response.body.id,
                },
              },
            },
            database: 1,
          },
          display: "table",
          description: null,
          visualization_settings: {},
          collection_id: null,
          result_metadata: null,
          metadata_checksum: null,
        });
      })
      .then(response => {
        cy.wrap(response.body.id).as("toplevelQuestionId");

        cy.visit(`/question/${response.body.id}`);
        cy.contains("41");
      });

    // Now sign in as a user w/no data access
    signIn("nodata");

    // They should be able to access both questions
    cy.get("@nestedQuestionId").then(nestedQuestionId => {
      cy.visit(`/question/${nestedQuestionId}`);
      cy.contains("Showing 41 rows");
    });

    cy.get("@toplevelQuestionId").then(toplevelQuestionId => {
      cy.visit(`/question/${toplevelQuestionId}`);
      cy.contains("41");
    });
  });
});
