import { restore } from "e2e/support/helpers";

const QUESTION = {
  native: { query: "select * from products" },
};

describe("issue 19180", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("/api/card/*/query").as("cardQuery");
  });

  it("shouldn't drop native model query results after leaving the query editor", () => {
    cy.createNativeQuestion(QUESTION).then(({ body: { id: QUESTION_ID } }) => {
      cy.request("PUT", `/api/card/${QUESTION_ID}`, { dataset: true }).then(
        () => {
          cy.visit(`/model/${QUESTION_ID}/query`);
          cy.wait("@cardQuery");
          cy.button("Cancel").click();
          cy.get(".TableInteractive");
          cy.findByText("Here's where your results will appear").should(
            "not.exist",
          );
        },
      );
    });
  });
});
