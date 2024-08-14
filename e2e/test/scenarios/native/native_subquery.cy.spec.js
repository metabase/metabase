import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  openNativeEditor,
  openQuestionActions,
  restore,
  visitQuestion,
  startNewNativeQuestion,
  runNativeQuery,
  entityPickerModal,
  focusNativeEditor,
  createQuestion,
  createNativeQuestion,
} from "e2e/support/helpers";

describe("scenarios > question > native subquery", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("typing a card tag should open the data reference", () => {
    cy.createNativeQuestion({
      name: "A People Question",
      native: { query: "SELECT id AS a_unique_column_name FROM PEOPLE" },
    }).then(({ body: { id: questionId1 } }) => {
      cy.createNativeQuestion({
        name: "A People Model",
        native: {
          query: "SELECT id AS another_unique_column_name FROM PEOPLE",
        },
        type: "model",
      }).then(({ body: { id: questionId2 } }) => {
        const tagName1 = `#${questionId1}-a-people-question`;
        const queryText = `{{${tagName1}}}`;
        // create a question with a template tag
        cy.createNativeQuestion({
          name: "Count of People",
          native: { query: queryText },
        }).then(({ body: { id: questionId3 } }) => {
          cy.wrap(questionId3).as("toplevelQuestionId");
          cy.visit(`/question/${questionId3}`);
          // Refresh the state, so previously created questions need to be loaded again.
          cy.reload();
          cy.findByText("Open Editor").click();
          // placing the cursor inside an existing template tag should open the data reference
          cy.get(".ace_content:visible").type("{leftarrow}");
          cy.findByText("A People Question");
          // subsequently moving the cursor out from the tag should keep the data reference open
          cy.get(".ace_content:visible").type("{rightarrow}");
          cy.findByText("A People Question");
          // typing a template tag id should open the editor
          cy.get(".ace_editor:not(.ace_autocomplete)")
            .type(" ")
            .type("{{#")
            .type(`{leftarrow}{leftarrow}${questionId2}`);
          cy.findByText("A People Model");
        });
      });
    });
  });

  it("autocomplete should complete question slugs inside template tags", () => {
    // Create a question and a model.
    cy.createNativeQuestion({
      name: "A People Question",
      native: {
        query: "SELECT id FROM PEOPLE",
      },
    }).then(({ body: { id: questionId1 } }) => {
      cy.createNativeQuestion({
        name: "A People Model",
        native: {
          query: "SELECT id FROM PEOPLE",
        },
        type: "model",
      }).then(({ body: { id: questionId2 } }) => {
        // Move question 2 to personal collection
        cy.visit(`/question/${questionId2}`);
        openQuestionActions();
        cy.findByTestId("move-button").click();
        entityPickerModal().within(() => {
          cy.findByRole("tab", { name: /Collections/ }).click();
          cy.findByText("Bobby Tables's Personal Collection").click();
          cy.button("Move").click();
        });

        openNativeEditor();
        cy.reload(); // Refresh the state, so previously created questions need to be loaded again.
        cy.get(".ace_editor").should("be.visible").type(" ").type("{{#people");

        // Wait until another explicit autocomplete is triggered
        // (slightly longer than AUTOCOMPLETE_DEBOUNCE_DURATION)
        // See https://github.com/metabase/metabase/pull/20970
        cy.wait(1000);
        cy.get(".ace_autocomplete")
          .should("be.visible")
          .findByText(`${questionId2}-a-`);
        cy.get(".ace_autocomplete")
          .should("be.visible")
          .findByText("Model in Bobby Tables's Personal Collection");
        cy.get(".ace_autocomplete")
          .should("be.visible")
          .findByText(`${questionId1}-a-`);
        cy.get(".ace_autocomplete")
          .should("be.visible")
          .findByText("Question in Our analytics");
      });
    });
  });

  it("autocomplete should work for columns from referenced questions", () => {
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
          cy.get(".ace_editor").should("be.visible").type(" ").type("a_unique");

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
            .type(" {{#")
            .type(`{leftarrow}{leftarrow}${questionId2}`);

          // Wait until another explicit autocomplete is triggered
          cy.wait(1000);

          // Again, typing in in one go doesn't always work
          // so type it in two parts
          cy.get(".ace_editor:not(.ace_autocomplete)")
            .type(" ")
            .type("another");

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
      cy.wrap(questionId1).as("questionId");
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
        cy.get("@questionId").then(questionId => {
          cy.get(".ace_content:visible").contains(
            `{{#${questionId}-a-people-question-1}}`,
          );
        });

        // change the name
        cy.visit(`/question/${questionId1}`);
        cy.findByText("A People Question 1").type(" changed");
        // unfocus the input
        cy.findByText("Open Editor").click();

        // check the name has changed
        cy.visit(`/question/${questionId2}`);
        cy.findByText("Open Editor").click();
        cy.get("@questionId").then(questionId => {
          cy.get(".ace_content:visible").contains(
            `{{#${questionId}-a-people-question-1-changed}}`,
          );
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

        cy.visit(`/question/${response.body.id}`);
        cy.contains("41");
      });

    // Now sign in as a user w/no data access
    cy.signIn("nodata");

    // They should be able to access both questions
    visitQuestion("@nestedQuestionId");
    cy.findByTestId("question-row-count").should(
      "have.text",
      "Showing 41 rows",
    );

    visitQuestion("@toplevelQuestionId");
    cy.get("#main-data-grid [data-testid=cell-data]").should("have.text", "41");
  });

  it("should be able to reference a nested question (metabase#25988)", () => {
    const questionDetails = {
      name: "Nested GUI question",
      query: {
        "source-table": `card__${ORDERS_QUESTION_ID}`,
        limit: 2,
      },
    };

    createQuestion(questionDetails).then(
      ({ body: { id: nestedQuestionId } }) => {
        const tagID = `#${nestedQuestionId}`;
        cy.intercept("GET", `/api/card/${nestedQuestionId}`).as("loadQuestion");

        startNewNativeQuestion();
        focusNativeEditor().type(`SELECT * FROM {{${tagID}`);
        cy.wait("@loadQuestion");
        cy.findByTestId("sidebar-header-title").should(
          "have.text",
          questionDetails.name,
        );

        runNativeQuery();
        cy.findAllByTestId("cell-data").should("contain", "37.65");
      },
    );
  });

  it("should be able to reference a saved native question that ends with a semicolon `;` (metabase#28218)", () => {
    const questionDetails = {
      name: "28218",
      native: { query: "select 1;" }, // semicolon is important here
    };

    createNativeQuestion(questionDetails).then(
      ({ body: { id: baseQuestionId } }) => {
        const tagID = `#${baseQuestionId}`;

        startNewNativeQuestion();
        focusNativeEditor().type(`SELECT * FROM {{${tagID}`);

        runNativeQuery();
        cy.findAllByTestId("cell-data").should("contain", "1");
      },
    );
  });
});
