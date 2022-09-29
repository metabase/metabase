import { restore, visitQuestion } from "__support__/e2e/helpers";

describe("scenarios > question > native subquery", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("autocomplete should work for question slugs inside template tags", () => {
    // Create two saved questions, the first will be referenced in the query when it is opened, and the second will be added to the query after it is opened.
    cy.createNativeQuestion({
      name: "A People Question",
      native: {
        query: "SELECT id AS a_unique_column_name FROM PEOPLE",
      },
    }).then(({ body: { id: questionId1 } }) => {
      cy.createNativeQuestion({
        name: "A People Question 2",
        native: {
          query: "SELECT id AS another_unique_column_name FROM PEOPLE",
        },
      }).then(({ body: { id: questionId2 } }) => {
        const tagID = `#${questionId1}`;

        // create a question with a template tag
        cy.createNativeQuestion({
          name: "Count of People",
          native: {
            query: `select COUNT(*) from `,
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
          cy.visit(`/question/${questionId3}`);

          // Refresh the state, so previously created questions need to be loaded again.
          cy.reload();
          cy.findByText("Open Editor").click();
          cy.get(".ace_editor").should("be.visible").type(" {{#");

          // Can't use cy.type here as it doesn't consistently keep the autocomplete open
          cy.realPress("p");
          cy.realPress("e");
          cy.realPress("o");
          cy.realPress("p");
          cy.realPress("l");
          cy.realPress("e");

          // Wait until another explicit autocomplete is triggered
          // (slightly longer than AUTOCOMPLETE_DEBOUNCE_DURATION)
          // See https://github.com/metabase/metabase/pull/20970
          cy.wait(1000);
          cy.get(".ace_autocomplete")
            .should("be.visible")
            .findByText(`${questionId1}-a-`);
          cy.get(".ace_autocomplete")
            .should("be.visible")
            .findByText(`${questionId2}-a-`);
        });
      });
    });
  });

  it("autocomplete should work for referencing saved questions", () => {
    // Create two saved questions, the first will be referenced in the query when it is opened, and the second will be added to the query after it is opened.
    cy.createNativeQuestion({
      name: "A People Question 1",
      native: {
        query: "SELECT id AS a_unique_column_name FROM PEOPLE",
      },
    }).then(({ body: { id: questionId1 } }) => {
      cy.createNativeQuestion({
        name: "A People Question 2",
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
          cy.visit(`/question/${questionId3}`);

          // Refresh the state, so previously created questions need to be loaded again.
          cy.reload();

          cy.findByText("Open Editor").click();

          cy.get(".ace_editor").should("be.visible").type(" a");

          // Can't use cy.type here as it doesn't consistently keep the autocomplete open
          cy.realPress("_");
          cy.realPress("u");
          cy.realPress("n");
          cy.realPress("i");
          cy.realPress("q");
          cy.realPress("u");
          cy.realPress("e");

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

          cy.get(".ace_editor:not(.ace_autocomplete)").type(" a");

          cy.realPress("n");
          cy.realPress("o");
          cy.realPress("t");
          cy.realPress("h");
          cy.realPress("e");
          cy.realPress("r");

          cy.get(".ace_autocomplete")
            .should("be.visible")
            .findByText("ANOTHER");
        });
      });
    });
  });

  it("card reference tags should update when the name of the card changes", () => {
    cy.createNativeQuestion({
      name: "A People Question 1",
      native: {
        query: "SELECT id AS a_unique_column_name FROM PEOPLE",
      },
    }).then(({ body: { id: questionId1 } }) => {
      const tagID = `#${questionId1}`;
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
      }).then(({ body: { id: questionId2 } }) => {
        // check the original name is in the query
        cy.visit(`/question/${questionId2}`);
        cy.findByText("Open Editor").click();
        cy.get(".ace_content:visible").contains("{{#4-a-people-question-1}}");

        // change the name
        cy.visit(`/question/${questionId1}`);
        cy.findByText("A People Question 1").type(" changed");
        // unfocus the input
        cy.findByText("Open Editor").click();

        // check the name has changed
        cy.visit(`/question/${questionId2}`);
        cy.findByText("Open Editor").click();
        cy.get(".ace_content:visible").contains(
          "{{#4-a-people-question-1-changed}}",
        );
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

        cy.visit(`/question/${response.body.id}`);
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
