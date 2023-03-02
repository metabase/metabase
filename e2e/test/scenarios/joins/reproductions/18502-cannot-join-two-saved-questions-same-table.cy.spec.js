import {
  restore,
  popover,
  visualize,
  startNewQuestion,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const question1 = getQuestionDetails("18502#1", PEOPLE.CREATED_AT);
const question2 = getQuestionDetails("18502#2", PEOPLE.BIRTH_DATE);

describe("issue 18502", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to join two saved questions based on the same table (metabase#18502)", () => {
    cy.intercept(`/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`).as("schema");

    cy.createQuestion(question1);
    cy.createQuestion(question2);

    startNewQuestion();
    cy.findByText("Saved Questions").click();

    cy.findByText("18502#1").click();
    cy.icon("join_left_outer").click();
    cy.wait("@schema");

    popover().within(() => {
      cy.findByTextEnsureVisible("Sample Database").click();
      cy.findByTextEnsureVisible("Saved Questions").click();
      cy.findByText("18502#2").click();
    });

    cy.findByText("Created At").click();
    cy.findByText("Birth Date").click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    cy.findByText("April, 2016");
  });
});

function getQuestionDetails(name, breakoutColumn) {
  return {
    name,
    query: {
      "source-table": PEOPLE_ID,
      aggregation: [["count"]],
      breakout: [["field", breakoutColumn, { "temporal-unit": "month" }]],
    },
  };
}
