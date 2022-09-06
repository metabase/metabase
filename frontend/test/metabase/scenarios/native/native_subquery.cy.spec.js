import { restore, visitQuestion } from "__support__/e2e/helpers";

describe("scenarios > question > native subquery", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("autocomplete should work for referencing saved questions", () => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    // Create two saved questions, the first will be referenced in the query when it is opened, and the second will be added to the query after it is opened.
    cy.createNativeQuestion({
      name: "A People Model 1",
      native: {
        query: "SELECT id AS a_unique_column_name FROM PEOPLE",
      },
    }).then(({ body: { id: questionId1 } }) => {
      cy.createNativeQuestion({
        name: "A People Model 2",
        native: {
          query: "SELECT id AS another_unique_column_name FROM PEOPLE",
        },
      }).then(({ body: { id: questionId2 } }) => {
        const tagID = `#${questionId1}`;

        // create a question with a template tag
        cy.createNativeQuestion({
          name: "Count of People",
          native: {
            query: `select COUNT(*) from {{#${questionId1}}}`,
            "template-tags": {
              [tagID]: {
                id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
                name: tagID,
                "display-name": tagID,
                type: "card",
                "card-id": questionId1,
              },
            },
          },
        }).then(({ body: { id: questionId3 } }) => {
          cy.wrap(questionId3).as("toplevelQuestionId");
          visitQuestion(questionId3);

          // Refresh the state, so previously created questions need to be loaded again.
          cy.reload();
          cy.wait("@cardQuery");

          cy.findByText("Open Editor").click();

          cy.get(".ace_editor").should("be.visible").type(" a_unique");

          // Wait until another explicit autocomplete is triggered
          // (slightly longer than AUTOCOMPLETE_DEBOUNCE_DURATION)
          // See https://github.com/metabase/metabase/pull/20970
          cy.wait(1000);

          cy.get(".ace_autocomplete")
            .should("be.visible")
            .findByText("A_UNIQUE");

          // For some reason, typing `{{#${questionId2}}}` in one go isn't deterministic,
          // so type it in two parts
          cy.get(".ace_editor:not(.ace_autocomplete)")
            .type(` {{#`, {
              parseSpecialCharSequences: false,
            })
            .type(`{leftarrow}{leftarrow}${questionId2}`);

          // Wait until another explicit autocomplete is triggered
          cy.wait(1000);

          cy.get(".ace_editor:not(.ace_autocomplete)").type(" another_unique");

          cy.get(".ace_autocomplete")
            .should("be.visible")
            .findByText("ANOTHER_UNIQUE");
        });
      });
    });
  });

  it("should allow a user with no data access to execute a native subquery", () => {
    // Create the initial SQL question and followup nested question
    cy.createNativeQuestion({
      name: "People in WA",
      native: {
        query: "select * from PEOPLE where STATE = 'WA'",
      },
    })
      .then(response => {
        cy.wrap(response.body.id).as("nestedQuestionId");
        const tagID = `#${response.body.id}`;

        cy.createNativeQuestion({
          name: "Count of People in WA",
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
        });
      })
      .then(response => {
        cy.wrap(response.body.id).as("toplevelQuestionId");

        visitQuestion(response.body.id);
        cy.contains("41");
      });

    // Now sign in as a user w/no data access
    cy.signIn("nodata");

    // They should be able to access both questions
    cy.get("@nestedQuestionId").then(nestedQuestionId => {
      visitQuestion(nestedQuestionId);
      cy.contains("Showing 41 rows");
    });

    cy.get("@toplevelQuestionId").then(toplevelQuestionId => {
      visitQuestion(toplevelQuestionId);
      cy.contains("41");
    });
  });
});
