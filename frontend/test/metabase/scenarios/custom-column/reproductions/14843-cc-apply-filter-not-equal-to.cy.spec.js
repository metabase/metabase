import { restore, popover, visualize, filter } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;
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
    cy.intercept("GET", "/api/database/1/schema/PUBLIC").as("schema");

    restore();
    cy.signInAsAdmin();
  });

  it("should correctly filter custom column by 'Not equal to' (metabase#14843)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    cy.icon("notebook").click();

    cy.wait("@schema");

    filter({ mode: "notebook" });

    popover().findByText(CC_NAME).click();

    cy.findByText("Equal to").click();
    cy.findByText("Not equal to").click();

    cy.findByPlaceholderText("Enter a number").type("3");
    cy.button("Add filter").click();

    visualize();

    cy.findByText(`${CC_NAME} is not equal to 3`);
    cy.findByText("Rye").should("not.exist");
  });
});
