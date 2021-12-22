import { restore, popover, visualize } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATASET;

const question1 = getQuestionDetails("18502#1", PEOPLE.CREATED_AT);
const question2 = getQuestionDetails("18502#2", PEOPLE.BIRTH_DATE);

describe.skip("issue 18502", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to join two saved questions based on the same table (metabase#18502)", () => {
    cy.createQuestion(question1);
    cy.createQuestion(question2);

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Saved Questions").click();

    cy.findByText("18502#1").click();
    cy.icon("join_left_outer").click();

    popover().within(() => {
      cy.findByTextEnsureVisible("Sample Dataset").click();
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
