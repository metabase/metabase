import { restore, popover, visualize } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATASET;
const CC_NAME = "City Length";

const questionDetails = {
  name: "14843",
  query: {
    "source-table": PEOPLE_ID,
    expressions: { [CC_NAME]: ["length", ["field", PEOPLE.CITY, null]] },
  },
};

describe("issue 14843", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should correctly filter custom column by 'Not equal to' (metabase#14843)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    cy.icon("notebook").click();
    cy.icon("filter").click();

    popover()
      .findByText(CC_NAME)
      .click();

    cy.findByText("Equal to").click();
    cy.findByText("Not equal to").click();

    cy.findByPlaceholderText("Enter a number").type("3");
    cy.button("Add filter").click();

    visualize();

    cy.findByTestId("view-section").within(() => {
      cy.findByText(`${CC_NAME} is not equal to 3`);
    });

    cy.findByText("Rye").should("not.exist");
  });
});
