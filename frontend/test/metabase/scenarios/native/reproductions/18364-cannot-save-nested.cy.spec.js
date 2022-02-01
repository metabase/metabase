import { restore } from "__support__/e2e/cypress";

const questionDetails = {
  name: "REVIEWS SQL",
  native: { query: "select REVIEWER from REVIEWS LIMIT 1" },
};

describe("issue 18364", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("cardCreated");

    restore();
    cy.signInAsAdmin();
  });

  it("should be able to save a nested question (metabase#18364)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.findByText("Explore results").click();

    cy.findByText("Save").click();

    cy.get(".Modal").button("Save").click();

    cy.wait("@cardCreated").then(({ response: { body } }) => {
      expect(body.error).not.to.exist;
    });

    cy.button("Failed").should("not.exist");
  });
});
